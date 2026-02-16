use actix_web::{web, HttpRequest, HttpResponse};
use actix_ws::Message;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use uuid::Uuid;

/// Represents a chat message sent/received over WebSocket.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsMessage {
    #[serde(rename = "type")]
    pub msg_type: String, // "message", "join", "leave", "room_deleted"
    pub room_id: Option<String>,
    pub user_id: Option<String>,
    pub username: Option<String>,
    pub content: Option<String>,
    pub reply_to_id: Option<String>,
    pub avatar_color: Option<i32>,
    pub image_url: Option<String>,
    pub avatar_url: Option<String>,
    pub banner_url: Option<String>,
    pub status: Option<String>,
    pub role: Option<String>,
    pub about: Option<String>,
    pub target_user_id: Option<String>,
    pub muted: Option<bool>,
    pub deafened: Option<bool>,
    pub sdp: Option<serde_json::Value>,
    pub candidate: Option<serde_json::Value>,
    #[serde(skip_deserializing, default)]
    pub id: String,
    #[serde(skip_deserializing, default)]
    pub created_at: String,
}

/// Shared broadcast channel for all WebSocket connections.
pub type Broadcaster = Arc<broadcast::Sender<String>>;

/// Shared state for online users: user_id -> username
pub type OnlineUsers = Arc<Mutex<HashMap<String, i32>>>; // user_id -> avatar_color (simplified)

pub fn create_broadcaster() -> Broadcaster {
    let (tx, _) = broadcast::channel::<String>(256);
    Arc::new(tx)
}

pub fn create_online_users() -> OnlineUsers {
    Arc::new(Mutex::new(HashMap::new()))
}

/// GET /ws — WebSocket upgrade
pub async fn ws_handler(
    req: HttpRequest,
    stream: web::Payload,
    pool: web::Data<SqlitePool>,
    broadcaster: web::Data<Broadcaster>,
    online_users: web::Data<OnlineUsers>,
) -> Result<HttpResponse, actix_web::Error> {
    let (response, session, mut msg_stream) = actix_ws::handle(&req, stream)?;

    let pool = pool.get_ref().clone();
    let tx = broadcaster.get_ref().clone();
    let users = online_users.get_ref().clone();
    let mut rx = tx.subscribe();

    // Determine user from query param or just wait for "join" message? 
    // For simplicity, we'll wait for a "join" message with user info, 
    // or we could extract token from query string. 
    // Let's assume the client sends an initial "join" message.
    
    let mut my_user_id: Option<String> = None;

    // Spawn task: forward broadcast messages to this client
    let mut send_session = session.clone();
    actix_web::rt::spawn(async move {
        while let Ok(text) = rx.recv().await {
            if send_session.text(text).await.is_err() {
                break;
            }
        }
    });

    // Spawn task: read messages from this client
    actix_web::rt::spawn(async move {
        while let Some(Ok(msg)) = msg_stream.next().await {
            match msg {
                Message::Text(text) => {
                    if let Ok(mut ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                        
                        // Handle JOIN
                        if ws_msg.msg_type == "join" {
                            if let (Some(uid), Some(_uname), Some(color)) = (&ws_msg.user_id, &ws_msg.username, ws_msg.avatar_color) {
                                my_user_id = Some(uid.clone());
                                {
                                    let mut guard = users.lock().unwrap();
                                    guard.insert(uid.clone(), color);
                                }
                                
                                // Broadcast join with all details
                                let join_msg = serde_json::json!({
                                    "type": "join",
                                    "user_id": uid,
                                    "username": _uname,
                                    "avatar_color": color,
                                    "avatar_url": ws_msg.avatar_url,
                                    "banner_url": ws_msg.banner_url,
                                    "status": ws_msg.status,
                                    "role": ws_msg.role,
                                    "about": ws_msg.about
                                });
                                let _ = tx.send(join_msg.to_string());
                            }
                        }
                        // Handle LEAVE (explicit)
                        else if ws_msg.msg_type == "leave" {
                             if let Some(uid) = &my_user_id {
                                {
                                    let mut guard = users.lock().unwrap();
                                    guard.remove(uid);
                                }
                                let _ = tx.send(text.to_string()); // Broadcast leave
                             }
                             break;
                        }
                                // Handle MESSAGE
                        else if ws_msg.msg_type == "message" {
                             if let (Some(content), Some(rid), Some(uid), Some(uname)) = (&ws_msg.content, &ws_msg.room_id, &ws_msg.user_id, &ws_msg.username) {
                                let room_required_role: Option<String> = sqlx::query_scalar("SELECT required_role FROM rooms WHERE id = ?")
                                    .bind(rid)
                                    .fetch_optional(&pool)
                                    .await
                                    .unwrap_or(None);

                                let user_role: Option<String> = sqlx::query_scalar("SELECT role FROM users WHERE id = ?")
                                    .bind(uid)
                                    .fetch_optional(&pool)
                                    .await
                                    .unwrap_or(None);

                                let allowed = match (room_required_role.as_deref(), user_role.as_deref()) {
                                    (Some("user"), Some(_)) => true,
                                    (Some(required), Some("admin")) => {
                                        let _ = required;
                                        true
                                    }
                                    (Some(required), Some(user_r)) => required == user_r,
                                    _ => false,
                                };

                                if !allowed {
                                    continue;
                                }

                                let has_content = !content.trim().is_empty();
                                let has_image = ws_msg.image_url.as_ref().map_or(false, |u| !u.is_empty());
                                if has_content || has_image {
                                    let msg_id = Uuid::new_v4().to_string();
                                    let now = chrono::Utc::now().to_rfc3339();

                                    let _ = sqlx::query(
                                        "INSERT INTO messages (id, room_id, user_id, username, content, created_at, image_url, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
                                    )
                                    .bind(&msg_id)
                                    .bind(rid)
                                    .bind(uid)
                                    .bind(uname)
                                    .bind(content)
                                    .bind(&now)
                                    .bind(&ws_msg.image_url)
                                    .bind(&ws_msg.reply_to_id)
                                    .execute(&pool)
                                    .await;

                                    ws_msg.id = msg_id;
                                    ws_msg.created_at = now;

                                    let _ = tx.send(serde_json::to_string(&ws_msg).unwrap());
                                }
                             }
                        }
                        // Handle TYPING relay
                        else if ws_msg.msg_type == "typing" {
                            let _ = tx.send(text.to_string());
                        }
                        // Handle PRESENCE relay
                        else if ws_msg.msg_type == "presence" {
                            let _ = tx.send(text.to_string());
                        }
                        // Handle VOICE events relay
                        else if ws_msg.msg_type == "voice_join"
                            || ws_msg.msg_type == "voice_leave"
                            || ws_msg.msg_type == "voice_state"
                            || ws_msg.msg_type == "voice_signal"
                        {
                            let _ = tx.send(text.to_string());
                        }
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }

        // Cleanup on disconnect
        if let Some(uid) = my_user_id {
            {
                let mut guard = users.lock().unwrap();
                guard.remove(&uid);
            }
            // Broadcast offline
            let offline_msg = serde_json::json!({
                "type": "leave",
                "user_id": uid
            });
            let _ = tx.send(offline_msg.to_string());
        }
    });

    Ok(response)
}
