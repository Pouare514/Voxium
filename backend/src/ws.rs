use actix_web::{web, HttpRequest, HttpResponse};
use actix_ws::Message;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::{HashMap, HashSet};
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

#[derive(Default)]
pub struct AccessCacheState {
    pub user_roles: HashMap<String, String>,
    pub room_required_roles: HashMap<String, String>,
}

pub type AccessCache = Arc<Mutex<AccessCacheState>>;

pub fn create_broadcaster() -> Broadcaster {
    let (tx, _) = broadcast::channel::<String>(256);
    Arc::new(tx)
}

pub fn create_online_users() -> OnlineUsers {
    Arc::new(Mutex::new(HashMap::new()))
}

pub fn create_access_cache() -> AccessCache {
    Arc::new(Mutex::new(AccessCacheState::default()))
}

pub fn cache_set_user_role(cache: &AccessCache, user_id: &str, role: &str) {
    let mut guard = cache.lock().unwrap();
    guard.user_roles.insert(user_id.to_string(), role.to_string());
}

pub fn cache_clear_user_roles(cache: &AccessCache) {
    let mut guard = cache.lock().unwrap();
    guard.user_roles.clear();
}

pub fn cache_set_room_required_role(cache: &AccessCache, room_id: &str, required_role: &str) {
    let mut guard = cache.lock().unwrap();
    guard
        .room_required_roles
        .insert(room_id.to_string(), required_role.to_string());
}

pub fn cache_remove_room(cache: &AccessCache, room_id: &str) {
    let mut guard = cache.lock().unwrap();
    guard.room_required_roles.remove(room_id);
}

async fn get_user_role_cached(pool: &SqlitePool, cache: &AccessCache, user_id: &str) -> Option<String> {
    {
        let guard = cache.lock().unwrap();
        if let Some(role) = guard.user_roles.get(user_id) {
            return Some(role.clone());
        }
    }

    let role: Option<String> = sqlx::query_scalar("SELECT role FROM users WHERE id = ?")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

    if let Some(ref role_value) = role {
        cache_set_user_role(cache, user_id, role_value);
    }

    role
}

async fn get_room_required_role_cached(pool: &SqlitePool, cache: &AccessCache, room_id: &str) -> Option<String> {
    {
        let guard = cache.lock().unwrap();
        if let Some(required_role) = guard.room_required_roles.get(room_id) {
            return Some(required_role.clone());
        }
    }

    let required_role: Option<String> = sqlx::query_scalar("SELECT required_role FROM rooms WHERE id = ?")
        .bind(room_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

    if let Some(ref role_value) = required_role {
        cache_set_room_required_role(cache, room_id, role_value);
    }

    required_role
}

pub async fn can_user_access_room_cached(
    pool: &SqlitePool,
    cache: &AccessCache,
    user_id: &str,
    room_id: &str,
) -> bool {
    let room_required_role = get_room_required_role_cached(pool, cache, room_id).await;
    let user_role = get_user_role_cached(pool, cache, user_id).await;

    match (room_required_role.as_deref(), user_role.as_deref()) {
        (Some("user"), Some(_)) => true,
        (Some(_), Some("admin")) => true,
        (Some(required), Some(user_r)) => required == user_r,
        _ => false,
    }
}

fn extract_room_id(payload: &str) -> Option<String> {
    let value = serde_json::from_str::<serde_json::Value>(payload).ok()?;
    value
        .get("room_id")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string())
}

async fn fetch_accessible_rooms(pool: &SqlitePool, role: &str) -> HashSet<String> {
    let rows = if role == "admin" {
        sqlx::query_scalar::<_, String>("SELECT id FROM rooms")
            .fetch_all(pool)
            .await
            .unwrap_or_default()
    } else {
        sqlx::query_scalar::<_, String>(
            "SELECT id FROM rooms WHERE required_role = 'user' OR required_role = ?"
        )
        .bind(role)
        .fetch_all(pool)
        .await
        .unwrap_or_default()
    };

    rows.into_iter().collect()
}

/// GET /ws — WebSocket upgrade
pub async fn ws_handler(
    req: HttpRequest,
    stream: web::Payload,
    pool: web::Data<SqlitePool>,
    broadcaster: web::Data<Broadcaster>,
    online_users: web::Data<OnlineUsers>,
    access_cache: web::Data<AccessCache>,
) -> Result<HttpResponse, actix_web::Error> {
    let (response, session, mut msg_stream) = actix_ws::handle(&req, stream)?;

    let pool = pool.get_ref().clone();
    let tx = broadcaster.get_ref().clone();
    let users = online_users.get_ref().clone();
    let access_cache = access_cache.get_ref().clone();
    let mut rx = tx.subscribe();

    // We'll wait for a "join" message to hydrate user context.
    let mut my_user_id: Option<String> = None;
    let allowed_rooms: Arc<Mutex<HashSet<String>>> = Arc::new(Mutex::new(HashSet::new()));
    let is_admin = Arc::new(Mutex::new(false));

    // Authenticate immediately
    use crate::auth::validate_token;
    
    // Try to get token from query string first
    let query_string = req.query_string();
    let mut token = None;
    
    if let Ok(params) = serde_urlencoded::from_str::<HashMap<String, String>>(query_string) {
        if let Some(t) = params.get("access_token") {
             token = Some(t.clone());
        }
    }
    
    // Fallback to Authorization header
    if token.is_none() {
        if let Some(auth_header) = req.headers().get("Authorization") {
             if let Ok(auth_str) = auth_header.to_str() {
                 if let Some(t) = auth_str.strip_prefix("Bearer ") {
                     token = Some(t.to_string());
                 }
             }
        }
    }

    let claims = match token {
        Some(t) => match validate_token(&t) {
            Some(claims) => claims,
            None => return Err(actix_web::error::ErrorUnauthorized("Invalid token")),
        },
        None => return Err(actix_web::error::ErrorUnauthorized("No token provided")),
    };

    // Pre-hydrate user session
    my_user_id = Some(claims.sub.clone());
    
    // Fetch initial state
    let role = get_user_role_cached(&pool, &access_cache, &claims.sub)
        .await
        .unwrap_or_else(|| "user".to_string());
    let rooms = fetch_accessible_rooms(&pool, &role).await;
    {
        let mut guard = allowed_rooms.lock().unwrap();
        *guard = rooms;
    }
    {
        let mut admin_guard = is_admin.lock().unwrap();
        *admin_guard = role == "admin";
    }
    
    // Add to online users
    {
         let mut guard = users.lock().unwrap();
         // We don't have avatar_color here without DB query, default to 0 for now. 
         // Realistically we should fetch user profile or include it in token if needed, 
         // but for now 0 is safe. 
         guard.insert(claims.sub.clone(), 0);
    }

    // Spawn task: forward broadcast messages to this client
    let mut send_session = session.clone();
    let send_allowed_rooms = allowed_rooms.clone();
    let send_is_admin = is_admin.clone();
    actix_web::rt::spawn(async move {
        while let Ok(text) = rx.recv().await {
            let room_id = extract_room_id(&text);
            if let Some(rid) = room_id {
                let allowed = {
                    let admin = *send_is_admin.lock().unwrap();
                    if admin {
                        true
                    } else {
                        let guard = send_allowed_rooms.lock().unwrap();
                        guard.contains(&rid)
                    }
                };

                if !allowed {
                    continue;
                }
            }

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
                        
                        // Handle JOIN - REFACTORED: 
                        // We ignore user_id from client. We trust our JWT claims.
                        // We still listen to "join" to broadcast presence if client wants to announce specific details 
                        // like updated avatar/status, but we override identity.
                        if ws_msg.msg_type == "join" {
                             if let Some(uid) = &my_user_id {
                                // Force ID to match token
                                ws_msg.user_id = Some(uid.clone());
                                
                                // Update color in map if provided
                                if let Some(color) = ws_msg.avatar_color {
                                     let mut guard = users.lock().unwrap();
                                     guard.insert(uid.clone(), color);
                                }
                                
                                // Broadcast join
                                let _ = tx.send(serde_json::to_string(&ws_msg).unwrap());
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
                                // SECURITY: Force user_id to match token
                                if Some(uid) != my_user_id.as_ref() {
                                    continue;
                                }

                                let allowed = can_user_access_room_cached(&pool, &access_cache, uid, rid).await;

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
