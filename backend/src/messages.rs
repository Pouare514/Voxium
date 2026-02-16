use actix_web::{web, HttpRequest, HttpResponse};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use sqlx::Row;
use crate::auth::extract_claims;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Message {
    pub id: String,
    pub room_id: String,
    pub user_id: String,
    pub username: String,
    pub content: String,
    pub reply_to_id: Option<String>,
    pub created_at: String,
    pub image_url: Option<String>,
    pub pinned_at: Option<String>,
    pub pinned_by: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
    pub author: Option<String>,
    pub room_id: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub limit: Option<i64>,
}

/// GET /api/rooms/{room_id}/messages — Fetch message history
pub async fn get_messages(
    req: HttpRequest,
    pool: web::Data<SqlitePool>,
    path: web::Path<String>,
) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().json(serde_json::json!({ "error": "Not authenticated" })),
    };

    let room_id = path.into_inner();

    let room_role: Option<String> = sqlx::query_scalar("SELECT required_role FROM rooms WHERE id = ?")
        .bind(&room_id)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None);

    let Some(required_role) = room_role else {
        return HttpResponse::NotFound().json(serde_json::json!({ "error": "Room not found" }));
    };

    if required_role != "user" && claims.role != "admin" && claims.role != required_role {
        return HttpResponse::Forbidden().json(serde_json::json!({ "error": "Access denied for this room" }));
    }

    let messages = sqlx::query_as::<_, Message>(
        "SELECT m.id, m.room_id, m.user_id, m.username, m.content, m.reply_to_id, m.created_at, m.image_url, m.pinned_at, m.pinned_by, u.avatar_url \
         FROM messages m LEFT JOIN users u ON m.user_id = u.id \
         WHERE m.room_id = ? ORDER BY m.created_at ASC LIMIT 200"
    )
    .bind(&room_id)
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    HttpResponse::Ok().json(messages)
}

/// DELETE /api/messages/{id}
pub async fn delete_message(
    req: actix_web::HttpRequest,
    pool: web::Data<SqlitePool>,
    path: web::Path<String>,
    broadcaster: web::Data<crate::ws::Broadcaster>,
) -> HttpResponse {
    use crate::auth::extract_claims;

    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().finish(),
    };

    let message_id = path.into_inner();

    // 1. Fetch message to check ownership and get room_id
    let msg = sqlx::query_as::<_, Message>(
        "SELECT m.id, m.room_id, m.user_id, m.username, m.content, m.reply_to_id, m.created_at, m.image_url, m.pinned_at, m.pinned_by, u.avatar_url \
         FROM messages m LEFT JOIN users u ON m.user_id = u.id WHERE m.id = ?"
    )
        .bind(&message_id)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None);

    let msg = match msg {
        Some(m) => m,
        None => return HttpResponse::NotFound().json(serde_json::json!({ "error": "Message not found" })),
    };

    // 2. Check permissions
    if msg.user_id != claims.sub && claims.role != "admin" {
        return HttpResponse::Forbidden().json(serde_json::json!({ "error": "You can only delete your own messages" }));
    }

    // 3. Delete uploaded image if any
    if let Some(ref url) = msg.image_url {
        let path = url.trim_start_matches('/');
        std::fs::remove_file(path).ok();
    }

    // 4. Delete from DB
    let _ = sqlx::query("DELETE FROM messages WHERE id = ?")
        .bind(&message_id)
        .execute(pool.get_ref())
        .await;

    // 5. Broadcast
    let event = serde_json::json!({
        "type": "message_deleted",
        "id": message_id,
        "room_id": msg.room_id
    });
    let _ = broadcaster.send(event.to_string());

    HttpResponse::Ok().json(serde_json::json!({ "status": "deleted" }))
}

/// GET /api/rooms/{room_id}/pins — List pinned messages
pub async fn get_pinned_messages(
    req: HttpRequest,
    pool: web::Data<SqlitePool>,
    path: web::Path<String>,
) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().json(serde_json::json!({ "error": "Not authenticated" })),
    };

    let room_id = path.into_inner();

    let room_role: Option<String> = sqlx::query_scalar("SELECT required_role FROM rooms WHERE id = ?")
        .bind(&room_id)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None);

    let Some(required_role) = room_role else {
        return HttpResponse::NotFound().json(serde_json::json!({ "error": "Room not found" }));
    };
    if required_role != "user" && claims.role != "admin" && claims.role != required_role {
        return HttpResponse::Forbidden().json(serde_json::json!({ "error": "Access denied for this room" }));
    }

    let messages = sqlx::query_as::<_, Message>(
        "SELECT m.id, m.room_id, m.user_id, m.username, m.content, m.reply_to_id, m.created_at, m.image_url, m.pinned_at, m.pinned_by, u.avatar_url \
         FROM messages m LEFT JOIN users u ON m.user_id = u.id \
         WHERE m.room_id = ? AND m.pinned_at IS NOT NULL ORDER BY m.pinned_at DESC LIMIT 50"
    )
    .bind(&room_id)
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    HttpResponse::Ok().json(messages)
}

/// POST /api/messages/{id}/pin — Pin message (admin only)
pub async fn pin_message(
    req: HttpRequest,
    pool: web::Data<SqlitePool>,
    path: web::Path<String>,
    broadcaster: web::Data<crate::ws::Broadcaster>,
) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().finish(),
    };

    if claims.role != "admin" {
        return HttpResponse::Forbidden().json(serde_json::json!({ "error": "Admin only" }));
    }

    let message_id = path.into_inner();

    let msg_room: Option<String> = sqlx::query_scalar("SELECT room_id FROM messages WHERE id = ?")
        .bind(&message_id)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None);

    let Some(room_id) = msg_room else {
        return HttpResponse::NotFound().json(serde_json::json!({ "error": "Message not found" }));
    };

    let now = chrono::Utc::now().to_rfc3339();
    let result = sqlx::query("UPDATE messages SET pinned_at = ?, pinned_by = ? WHERE id = ?")
        .bind(&now)
        .bind(&claims.sub)
        .bind(&message_id)
        .execute(pool.get_ref())
        .await;

    match result {
        Ok(_) => {
            let event = serde_json::json!({
                "type": "message_pinned",
                "id": message_id,
                "room_id": room_id,
                "pinned_at": now,
                "pinned_by": claims.sub,
            });
            let _ = broadcaster.send(event.to_string());
            HttpResponse::Ok().json(serde_json::json!({ "status": "pinned" }))
        }
        Err(_) => HttpResponse::InternalServerError().json(serde_json::json!({ "error": "Failed to pin message" })),
    }
}

/// DELETE /api/messages/{id}/pin — Unpin message (admin only)
pub async fn unpin_message(
    req: HttpRequest,
    pool: web::Data<SqlitePool>,
    path: web::Path<String>,
    broadcaster: web::Data<crate::ws::Broadcaster>,
) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().finish(),
    };

    if claims.role != "admin" {
        return HttpResponse::Forbidden().json(serde_json::json!({ "error": "Admin only" }));
    }

    let message_id = path.into_inner();

    let msg_room: Option<String> = sqlx::query_scalar("SELECT room_id FROM messages WHERE id = ?")
        .bind(&message_id)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None);

    let Some(room_id) = msg_room else {
        return HttpResponse::NotFound().json(serde_json::json!({ "error": "Message not found" }));
    };

    let result = sqlx::query("UPDATE messages SET pinned_at = NULL, pinned_by = NULL WHERE id = ?")
        .bind(&message_id)
        .execute(pool.get_ref())
        .await;

    match result {
        Ok(_) => {
            let event = serde_json::json!({
                "type": "message_unpinned",
                "id": message_id,
                "room_id": room_id,
            });
            let _ = broadcaster.send(event.to_string());
            HttpResponse::Ok().json(serde_json::json!({ "status": "unpinned" }))
        }
        Err(_) => HttpResponse::InternalServerError().json(serde_json::json!({ "error": "Failed to unpin message" })),
    }
}

/// DELETE /api/users/{id}/messages — Admin purge all messages from one user
pub async fn delete_user_messages(
    req: actix_web::HttpRequest,
    pool: web::Data<SqlitePool>,
    path: web::Path<String>,
    broadcaster: web::Data<crate::ws::Broadcaster>,
) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().finish(),
    };

    if claims.role != "admin" {
        return HttpResponse::Forbidden().json(serde_json::json!({ "error": "Admin only" }));
    }

    let target_user_id = path.into_inner();

    let result = sqlx::query("DELETE FROM messages WHERE user_id = ?")
        .bind(&target_user_id)
        .execute(pool.get_ref())
        .await;

    match result {
        Ok(res) => {
            let event = serde_json::json!({
                "type": "messages_purged",
                "user_id": target_user_id,
                "count": res.rows_affected()
            });
            let _ = broadcaster.send(event.to_string());

            HttpResponse::Ok().json(serde_json::json!({
                "status": "purged",
                "count": res.rows_affected()
            }))
        }
        Err(_) => HttpResponse::InternalServerError().json(serde_json::json!({ "error": "Failed to purge messages" })),
    }
}

/// GET /api/messages/search — Advanced message search
pub async fn search_messages(
    req: HttpRequest,
    pool: web::Data<SqlitePool>,
    query: web::Query<SearchQuery>,
) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().json(serde_json::json!({ "error": "Not authenticated" })),
    };

    if let Some(room_id) = &query.room_id {
        let room_role: Option<String> = sqlx::query_scalar("SELECT required_role FROM rooms WHERE id = ?")
            .bind(room_id)
            .fetch_optional(pool.get_ref())
            .await
            .unwrap_or(None);

        let Some(required_role) = room_role else {
            return HttpResponse::NotFound().json(serde_json::json!({ "error": "Room not found" }));
        };
        if required_role != "user" && claims.role != "admin" && claims.role != required_role {
            return HttpResponse::Forbidden().json(serde_json::json!({ "error": "Access denied for this room" }));
        }
    }

    let limit = query.limit.unwrap_or(80).clamp(1, 200);
    let mut sql = String::from(
        "SELECT m.id, m.room_id, m.user_id, m.username, m.content, m.reply_to_id, m.created_at, m.image_url, m.pinned_at, m.pinned_by, u.avatar_url \
         FROM messages m \
         LEFT JOIN users u ON m.user_id = u.id \
         LEFT JOIN rooms r ON m.room_id = r.id \
         WHERE 1=1"
    );

    if claims.role != "admin" {
        sql.push_str(" AND (r.required_role = 'user' OR r.required_role = ?)");
    }

    if query.room_id.is_some() {
        sql.push_str(" AND m.room_id = ?");
    }
    if query.q.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false) {
        sql.push_str(" AND m.content LIKE ?");
    }
    if query.author.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false) {
        sql.push_str(" AND m.username LIKE ?");
    }
    if query.from.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false) {
        sql.push_str(" AND m.created_at >= ?");
    }
    if query.to.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false) {
        sql.push_str(" AND m.created_at <= ?");
    }

    sql.push_str(" ORDER BY m.created_at DESC LIMIT ?");

    let mut qx = sqlx::query(&sql);
    if claims.role != "admin" {
        qx = qx.bind(&claims.role);
    }
    if let Some(room_id) = &query.room_id {
        qx = qx.bind(room_id);
    }
    if let Some(value) = &query.q {
        if !value.trim().is_empty() {
            qx = qx.bind(format!("%{}%", value.trim()));
        }
    }
    if let Some(value) = &query.author {
        if !value.trim().is_empty() {
            qx = qx.bind(format!("%{}%", value.trim()));
        }
    }
    if let Some(value) = &query.from {
        if !value.trim().is_empty() {
            qx = qx.bind(format!("{}T00:00:00", value.trim()));
        }
    }
    if let Some(value) = &query.to {
        if !value.trim().is_empty() {
            qx = qx.bind(format!("{}T23:59:59", value.trim()));
        }
    }
    qx = qx.bind(limit);

    let rows = qx.fetch_all(pool.get_ref()).await.unwrap_or_default();
    let mut messages: Vec<Message> = Vec::with_capacity(rows.len());
    for row in rows {
        messages.push(Message {
            id: row.try_get("id").unwrap_or_default(),
            room_id: row.try_get("room_id").unwrap_or_default(),
            user_id: row.try_get("user_id").unwrap_or_default(),
            username: row.try_get("username").unwrap_or_default(),
            content: row.try_get("content").unwrap_or_default(),
            reply_to_id: row.try_get("reply_to_id").unwrap_or(None),
            created_at: row.try_get("created_at").unwrap_or_default(),
            image_url: row.try_get("image_url").unwrap_or(None),
            pinned_at: row.try_get("pinned_at").unwrap_or(None),
            pinned_by: row.try_get("pinned_by").unwrap_or(None),
            avatar_url: row.try_get("avatar_url").unwrap_or(None),
        });
    }

    HttpResponse::Ok().json(messages)
}
