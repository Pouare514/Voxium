use actix_web::{web, HttpRequest, HttpResponse};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;
use crate::auth::extract_claims;
use crate::ws::Broadcaster;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Room {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub required_role: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateRoom {
    pub name: String,
    pub kind: Option<String>,
    pub required_role: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRoomSettings {
    pub name: String,
    pub kind: String,
    pub required_role: String,
}

/// GET /api/rooms — List all rooms
pub async fn list_rooms(req: HttpRequest, pool: web::Data<SqlitePool>) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().json(serde_json::json!({ "error": "Not authenticated" })),
    };

    let rooms = if claims.role == "admin" {
        sqlx::query_as::<_, Room>("SELECT id, name, kind, required_role, created_at FROM rooms ORDER BY created_at")
            .fetch_all(pool.get_ref())
            .await
            .unwrap_or_default()
    } else {
        sqlx::query_as::<_, Room>(
            "SELECT id, name, kind, required_role, created_at FROM rooms WHERE required_role = 'user' OR required_role = ? ORDER BY created_at"
        )
        .bind(&claims.role)
        .fetch_all(pool.get_ref())
        .await
        .unwrap_or_default()
    };

    HttpResponse::Ok().json(rooms)
}

/// POST /api/rooms — Create a new room (requires auth)
pub async fn create_room(
    req: HttpRequest,
    pool: web::Data<SqlitePool>,
    body: web::Json<CreateRoom>,
) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().json(serde_json::json!({ "error": "Not authenticated" })),
    };

    let name = body.name.trim();
    if name.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": "Room name is required" }));
    }

    let kind = body.kind.as_deref().unwrap_or("text").trim().to_lowercase();
    if kind != "text" && kind != "voice" {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": "Room kind must be text or voice" }));
    }

    let required_role = body.required_role.as_deref().unwrap_or("user").trim().to_lowercase();

    let role_exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM roles WHERE name = ?")
        .bind(&required_role)
        .fetch_one(pool.get_ref())
        .await
        .unwrap_or(0);

    if role_exists <= 0 {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": "Invalid required role" }));
    }

    if required_role != "user" && claims.role != "admin" {
        return HttpResponse::Forbidden().json(serde_json::json!({ "error": "Only admins can create restricted rooms" }));
    }

    let id = Uuid::new_v4().to_string();

    let result = sqlx::query("INSERT INTO rooms (id, name, kind, required_role) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(name)
        .bind(&kind)
        .bind(&required_role)
        .execute(pool.get_ref())
        .await;

    match result {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({ "id": id, "name": name, "kind": kind, "required_role": required_role })),
        Err(_) => HttpResponse::Conflict().json(serde_json::json!({ "error": "Room name already exists" })),
    }
}

/// PATCH /api/rooms/{id} — Update room settings (Admin only)
pub async fn update_room(
    req: HttpRequest,
    pool: web::Data<SqlitePool>,
    path: web::Path<String>,
    body: web::Json<UpdateRoomSettings>,
    broadcaster: web::Data<Broadcaster>,
) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().finish(),
    };

    if claims.role != "admin" {
        return HttpResponse::Forbidden().json(serde_json::json!({ "error": "Admin only" }));
    }

    let room_id = path.into_inner();
    let room_name = body.name.trim();
    if room_name.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": "Room name is required" }));
    }

    let kind = body.kind.trim().to_lowercase();
    if kind != "text" && kind != "voice" {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": "Room kind must be text or voice" }));
    }

    let required_role = body.required_role.trim().to_lowercase();

    let role_exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM roles WHERE name = ?")
        .bind(&required_role)
        .fetch_one(pool.get_ref())
        .await
        .unwrap_or(0);

    if role_exists <= 0 {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": "Invalid required role" }));
    }

    let result = sqlx::query("UPDATE rooms SET name = ?, kind = ?, required_role = ? WHERE id = ?")
        .bind(room_name)
        .bind(&kind)
        .bind(&required_role)
        .bind(&room_id)
        .execute(pool.get_ref())
        .await;

    match result {
        Ok(res) => {
            if res.rows_affected() == 0 {
                return HttpResponse::NotFound().json(serde_json::json!({ "error": "Room not found" }));
            }

            let event = serde_json::json!({
                "type": "room_updated",
                "room_id": room_id,
                "name": room_name,
                "kind": kind,
                "required_role": required_role,
            });
            let _ = broadcaster.send(event.to_string());

            HttpResponse::Ok().json(serde_json::json!({ "status": "updated" }))
        }
        Err(_) => HttpResponse::Conflict().json(serde_json::json!({ "error": "Room name already exists" })),
    }
}

/// DELETE /api/rooms/{id} — Delete a room (Admin only)
pub async fn delete_room(
    req: HttpRequest,
    pool: web::Data<SqlitePool>,
    path: web::Path<String>,
    broadcaster: web::Data<Broadcaster>,
) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().finish(),
    };

    if claims.role != "admin" {
        return HttpResponse::Forbidden().json(serde_json::json!({ "error": "Admin only" }));
    }

    let room_id = path.into_inner();

    // Delete messages first (cascade typically handles this but we enforce)
    let _ = sqlx::query("DELETE FROM messages WHERE room_id = ?")
        .bind(&room_id)
        .execute(pool.get_ref())
        .await;

    let result = sqlx::query("DELETE FROM rooms WHERE id = ?")
        .bind(&room_id)
        .execute(pool.get_ref())
        .await;

    match result {
        Ok(res) => {
            if res.rows_affected() > 0 {
                // Broadcast room_deleted event
                let msg = serde_json::json!({
                    "type": "room_deleted",
                    "room_id": room_id
                });
                let _ = broadcaster.send(msg.to_string());
                HttpResponse::Ok().json(serde_json::json!({ "status": "deleted" }))
            } else {
                HttpResponse::NotFound().json(serde_json::json!({ "error": "Room not found" }))
            }
        }
        Err(_) => HttpResponse::InternalServerError().finish(),
    }
}
