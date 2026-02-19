use actix_web::{http::StatusCode, web, HttpRequest, HttpResponse};
use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::Utc;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::{SqlitePool, Row};
use uuid::Uuid;

// ── Models ──────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,       // user id
    pub username: String,
    pub role: String,      // "user" or "admin"
    pub exp: usize,
}

#[derive(Debug, Deserialize)]
pub struct AuthPayload {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct AuthResponse {
    pub token: String,
    pub user_id: String,
    pub username: String,
    pub role: String,
    pub avatar_color: i32,
    pub about: String,
    pub avatar_url: Option<String>,
    pub banner_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfile {
    pub username: Option<String>,
    pub about: Option<String>,
    pub avatar_color: Option<i32>,
    pub password: Option<String>,
    pub avatar_url: Option<String>,
    pub banner_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DiscordUserTokenPayload {
    pub discord_token: String,
}

#[derive(Debug, Deserialize)]
pub struct DiscordProxyPayload {
    pub method: Option<String>,
    pub path: String,
    pub body: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct DiscordUser {
    id: String,
    username: String,
    global_name: Option<String>,
    avatar: Option<String>,
}

// ── JWT helpers ─────────────────────────────────────────

fn jwt_secret() -> String {
    std::env::var("JWT_SECRET").expect("JWT_SECRET must be set")
}

pub fn create_token(user_id: &str, username: &str, role: &str) -> String {
    let expiration = Utc::now()
        .checked_add_signed(chrono::Duration::days(7))
        .expect("valid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        sub: user_id.to_string(),
        username: username.to_string(),
        role: role.to_string(),
        exp: expiration,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_secret().as_bytes()),
    )
    .expect("token creation failed")
}

pub fn validate_token(token: &str) -> Option<Claims> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(jwt_secret().as_bytes()),
        &Validation::default(),
    )
    .map(|data| data.claims)
    .ok()
}

/// Extract claims from the Authorization header.
pub fn extract_claims(req: &HttpRequest) -> Option<Claims> {
    let auth_header = req.headers().get("Authorization")?.to_str().ok()?;
    let token = auth_header.strip_prefix("Bearer ")?;
    validate_token(token)
}

pub(crate) fn discord_api_base_url() -> String {
    std::env::var("DISCORD_API_BASE_URL").unwrap_or_else(|_| "https://discord.com/api/v10".into())
}

pub(crate) fn discord_cdn_base_url() -> String {
    std::env::var("DISCORD_CDN_BASE_URL").unwrap_or_else(|_| "https://cdn.discordapp.com".into())
}

pub(crate) fn discord_avatar_url(discord_user: &DiscordUser) -> Option<String> {
    let avatar_hash = discord_user.avatar.as_ref()?;
    Some(format!(
        "{}/avatars/{}/{}.png?size=256",
        discord_cdn_base_url(),
        discord_user.id,
        avatar_hash
    ))
}

pub(crate) fn preferred_discord_username(discord_user: &DiscordUser) -> String {
    let preferred = discord_user
        .global_name
        .as_deref()
        .unwrap_or(&discord_user.username)
        .trim();
    if preferred.is_empty() {
        "discord-user".to_string()
    } else {
        preferred.to_string()
    }
}

pub(crate) async fn allocate_unique_username(pool: &SqlitePool, preferred: &str) -> String {
    let base = if preferred.trim().is_empty() {
        "discord-user"
    } else {
        preferred.trim()
    };

    for index in 0..150 {
        let candidate = if index == 0 {
            base.to_string()
        } else {
            format!("{}-{}", base, index)
        };
        let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE username = ?")
            .bind(&candidate)
            .fetch_one(pool)
            .await
            .unwrap_or(0);
        if count == 0 {
            return candidate;
        }
    }

    format!("discord-{}", Uuid::new_v4().as_simple())
}

// ── Handlers ────────────────────────────────────────────

pub async fn register(
    pool: web::Data<SqlitePool>,
    body: web::Json<AuthPayload>,
) -> HttpResponse {
    let username = body.username.trim();
    if username.is_empty() || body.password.len() < 8 {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Username must be non-empty and password at least 8 characters"
        }));
    }

    // Check if duplicate
    let exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE username = ?")
        .bind(username)
        .fetch_one(pool.get_ref())
        .await
        .unwrap_or(0);

    if exists > 0 {
        return HttpResponse::Conflict().json(serde_json::json!({
            "error": "Username already taken"
        }));
    }

    let id = Uuid::new_v4().to_string();
    let password_hash = hash(&body.password, DEFAULT_COST).expect("hash failed");
    let role = "user"; // Default role

    sqlx::query("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(username)
        .bind(&password_hash)
        .bind(role)
        .execute(pool.get_ref())
        .await
        .expect("insert user failed");

    let token = create_token(&id, username, role);

    HttpResponse::Ok().json(AuthResponse {
        token,
        user_id: id,
        username: username.to_string(),
        role: role.to_string(),
        avatar_color: 0,
        about: "".to_string(),
        avatar_url: None,
        banner_url: None,
    })
}

pub async fn login(
    pool: web::Data<SqlitePool>,
    body: web::Json<AuthPayload>,
) -> HttpResponse {
    // We select all user fields now
    let row = sqlx::query("SELECT id, password_hash, role, avatar_color, about, avatar_url, banner_url FROM users WHERE username = ?")
        .bind(&body.username)
        .fetch_optional(pool.get_ref())
        .await
        .expect("query failed");

    if let Some(row) = row {
        let id: String = row.get("id");
        let password_hash: String = row.get("password_hash");
        let role: String = row.get("role");
        let avatar_color: i32 = row.try_get("avatar_color").unwrap_or(0);
        let about: String = row.try_get("about").unwrap_or_default();
        let avatar_url: Option<String> = row.try_get("avatar_url").unwrap_or(None);
        let banner_url: Option<String> = row.try_get("banner_url").unwrap_or(None);

        if verify(&body.password, &password_hash).unwrap_or(false) {
            let token = create_token(&id, &body.username, &role);
            HttpResponse::Ok().json(AuthResponse {
                token,
                user_id: id,
                username: body.username.clone(),
                role,
                avatar_color,
                about,
                avatar_url,
                banner_url,
            })
        } else {
             HttpResponse::Unauthorized().json(serde_json::json!({ "error": "Invalid username or password" }))
        }
    } else {
        HttpResponse::Unauthorized().json(serde_json::json!({ "error": "Invalid username or password" }))
    }
}

/// Core logic: validate a Discord user token, create/update local user, return AuthResponse.
pub(crate) async fn do_discord_token_login(
    pool: &SqlitePool,
    discord_token: &str,
) -> Result<AuthResponse, String> {
    let client = Client::new();
    let discord_user_response = client
        .get(format!("{}/users/@me", discord_api_base_url()))
        .header("Authorization", discord_token)
        .send()
        .await
        .map_err(|_| "Discord API indisponible".to_string())?;

    if !discord_user_response.status().is_success() {
        let details = discord_user_response
            .text()
            .await
            .unwrap_or_else(|_| "Token Discord invalide".to_string());
        return Err(format!("Token Discord invalide ou expiré: {details}"));
    }

    let discord_user: DiscordUser = discord_user_response
        .json()
        .await
        .map_err(|_| "Réponse Discord invalide".to_string())?;

    let discord_avatar = discord_avatar_url(&discord_user);

    let existing = sqlx::query(
        "SELECT id, username, role, avatar_color, about, avatar_url, banner_url FROM users WHERE discord_id = ?",
    )
    .bind(&discord_user.id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let (user_id, username, role, avatar_color, about, avatar_url, banner_url) =
        if let Some(row) = existing {
            let user_id: String = row.get("id");
            let username: String = row.get("username");
            let role: String = row.get("role");
            let avatar_color: i32 = row.try_get("avatar_color").unwrap_or(0);
            let about: String = row.try_get("about").unwrap_or_default();
            let old_avatar_url: Option<String> = row.try_get("avatar_url").unwrap_or(None);
            let banner_url: Option<String> = row.try_get("banner_url").unwrap_or(None);
            let merged_avatar_url = discord_avatar.clone().or(old_avatar_url);

            let encrypted_token = crate::crypto::encrypt_token(discord_token);
            let _ = sqlx::query("UPDATE users SET discord_access_token = ?, discord_refresh_token = NULL, discord_token_expires_at = NULL, avatar_url = ? WHERE id = ?")
                .bind(encrypted_token)
                .bind(&merged_avatar_url)
                .bind(&user_id)
                .execute(pool)
                .await;

            (user_id, username, role, avatar_color, about, merged_avatar_url, banner_url)
        } else {
            let user_id = Uuid::new_v4().to_string();
            let role = "user".to_string();
            let avatar_color = 0;
            let about = "".to_string();
            let banner_url = None;
            let preferred = preferred_discord_username(&discord_user);
            let username = allocate_unique_username(pool, &preferred).await;
            let generated_password = Uuid::new_v4().to_string();
            let password_hash = hash(generated_password, DEFAULT_COST).expect("hash failed");

            let encrypted_token = crate::crypto::encrypt_token(discord_token);
            let insert_result = sqlx::query("INSERT INTO users (id, username, password_hash, role, avatar_color, about, avatar_url, banner_url, discord_id, discord_access_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .bind(&user_id)
                .bind(&username)
                .bind(&password_hash)
                .bind(&role)
                .bind(avatar_color)
                .bind(&about)
                .bind(&discord_avatar)
                .bind(&banner_url)
                .bind(&discord_user.id)
                .bind(encrypted_token)
                .execute(pool)
                .await;

            if insert_result.is_err() {
                return Err("Impossible de créer l'utilisateur Discord local".to_string());
            }

            (
                user_id,
                username,
                role,
                avatar_color,
                about,
                discord_avatar,
                banner_url,
            )
        };

    let token = create_token(&user_id, &username, &role);
    Ok(AuthResponse {
        token,
        user_id,
        username,
        role,
        avatar_color,
        about,
        avatar_url,
        banner_url,
    })
}

/// POST /api/auth/discord/token — Login with a Discord user token.
pub async fn login_discord_token(
    pool: web::Data<SqlitePool>,
    body: web::Json<DiscordUserTokenPayload>,
) -> HttpResponse {
    let discord_token = body.discord_token.trim().to_string();
    if discord_token.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "discord_token manquant"
        }));
    }
    match do_discord_token_login(pool.get_ref(), &discord_token).await {
        Ok(auth) => HttpResponse::Ok().json(auth),
        Err(msg) => HttpResponse::Unauthorized().json(serde_json::json!({ "error": msg })),
    }
}

/// GET /api/discord/me — Fetch the current user's Discord profile using the stored user token.
pub async fn get_discord_me(req: HttpRequest, pool: web::Data<SqlitePool>) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().finish(),
    };

    let row = sqlx::query(
        "SELECT discord_access_token FROM users WHERE id = ?",
    )
    .bind(&claims.sub)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    let Some(row) = row else {
        return HttpResponse::NotFound().finish();
    };

    let access_token: Option<String> = row.try_get("discord_access_token").unwrap_or(None);

    let Some(encrypted_token) = access_token else {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Aucun token Discord lié"
        }));
    };

    let Some(access_token) = crate::crypto::decrypt_token(&encrypted_token) else {
         return HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "Echec du déchiffrement du token"
        }));
    };

    let response = match Client::new()
        .get(format!("{}/users/@me", discord_api_base_url()))
        .header("Authorization", &access_token)
        .send()
        .await
    {
        Ok(res) => res,
        Err(_) => return HttpResponse::BadGateway().json(serde_json::json!({ "error": "Discord API indisponible" })),
    };

    let status = StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let payload = response.text().await.unwrap_or_else(|_| "{}".to_string());
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&payload) {
        HttpResponse::build(status).json(json)
    } else {
        HttpResponse::build(status).body(payload)
    }
}

/// POST /api/discord/proxy — Proxy any Discord API call using the stored user token.
pub async fn discord_proxy(
    req: HttpRequest,
    pool: web::Data<SqlitePool>,
    body: web::Json<DiscordProxyPayload>,
) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().finish(),
    };

    let path = body.path.trim();
    if path.is_empty() || !path.starts_with('/') || path.starts_with("//") {
         return HttpResponse::BadRequest().json(serde_json::json!({
             "error": "Discord path invalide"
         }));
    }

    // Whitelist allowed paths
    let allowed_paths = ["/users/@me", "/users/@me/guilds"];
    let is_allowed = allowed_paths.iter().any(|p| path.starts_with(p));
    if !is_allowed {
        return HttpResponse::BadRequest().json(serde_json::json!({
             "error": "Path not allowed"
        }));
    }

    let method = body
        .method
        .as_deref()
        .unwrap_or("GET")
        .trim()
        .to_uppercase();
    let allowed = ["GET", "POST", "PUT", "PATCH", "DELETE"];
    if !allowed.contains(&method.as_str()) {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": "Method not allowed" }));
    }

    let row = sqlx::query(
        "SELECT discord_access_token FROM users WHERE id = ?",
    )
    .bind(&claims.sub)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    let Some(row) = row else {
        return HttpResponse::NotFound().finish();
    };

    let access_token: Option<String> = row.try_get("discord_access_token").unwrap_or(None);

    let Some(encrypted_token) = access_token else {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Aucun token Discord lié"
        }));
    };

    let Some(access_token) = crate::crypto::decrypt_token(&encrypted_token) else {
         return HttpResponse::InternalServerError().json(serde_json::json!({
            "error": "Echec du déchiffrement du token"
        }));
    };

    let method_obj = match method.as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "PATCH" => reqwest::Method::PATCH,
        "DELETE" => reqwest::Method::DELETE,
        _ => reqwest::Method::GET,
    };

    let mut request_builder = Client::new()
        .request(method_obj, format!("{}{}", discord_api_base_url(), path))
        .header("Authorization", &access_token);

    if let Some(json_body) = &body.body {
        request_builder = request_builder.json(json_body);
    }

    let response = match request_builder.send().await {
        Ok(res) => res,
        Err(_) => {
            return HttpResponse::BadGateway().json(serde_json::json!({
                "error": "Discord API indisponible"
            }))
        }
    };

    let status = StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let payload = response.text().await.unwrap_or_else(|_| "{}".to_string());

    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&payload) {
        HttpResponse::build(status).json(json)
    } else {
        HttpResponse::build(status).body(payload)
    }
}

pub async fn get_me(
    req: HttpRequest,
    pool: web::Data<SqlitePool>,
) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().finish(),
    };

    let row = sqlx::query("SELECT username, role, avatar_color, about, avatar_url, banner_url FROM users WHERE id = ?")
        .bind(&claims.sub)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None);

    if let Some(row) = row {
         let username: String = row.get("username");
         let role: String = row.get("role");
         let avatar_color: i32 = row.try_get("avatar_color").unwrap_or(0);
         let about: String = row.try_get("about").unwrap_or_default();
         let avatar_url: Option<String> = row.try_get("avatar_url").unwrap_or(None);
         let banner_url: Option<String> = row.try_get("banner_url").unwrap_or(None);

         HttpResponse::Ok().json(serde_json::json!({
             "user_id": claims.sub,
             "username": username,
             "role": role,
             "avatar_color": avatar_color,
             "about": about,
             "avatar_url": avatar_url,
             "banner_url": banner_url,
         }))
    } else {
        HttpResponse::NotFound().finish()
    }
}

pub async fn update_profile(
    req: HttpRequest,
    pool: web::Data<SqlitePool>,
    body: web::Json<UpdateProfile>,
    broadcaster: web::Data<crate::ws::Broadcaster>,
) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().finish(),
    };

    // ... existing update logic ...
    // Build UPDATE dynamically — avoid Separated API which can produce broken SQL
    let mut set_clauses: Vec<&str> = Vec::new();
    let mut password_hash_val: Option<String> = None;

    if let Some(username) = &body.username {
        if !username.trim().is_empty() {
            set_clauses.push("username = ?");
        }
    }
    if body.about.is_some() {
        set_clauses.push("about = ?");
    }
    if body.avatar_color.is_some() {
        set_clauses.push("avatar_color = ?");
    }
    if let Some(password) = &body.password {
        if password.len() >= 4 {
            password_hash_val = Some(hash(password, DEFAULT_COST).expect("hash failed"));
            set_clauses.push("password_hash = ?");
        }
    }
    if body.avatar_url.is_some() {
        set_clauses.push("avatar_url = ?");
    }
    if body.banner_url.is_some() {
        set_clauses.push("banner_url = ?");
    }

    if set_clauses.is_empty() {
        return HttpResponse::Ok().json(serde_json::json!({ "status": "no changes" }));
    }

    let sql = format!("UPDATE users SET {} WHERE id = ?", set_clauses.join(", "));
    let mut query = sqlx::query(&sql);

    // Bind values in the same order as set_clauses
    if let Some(username) = &body.username {
        if !username.trim().is_empty() {
            query = query.bind(username.trim().to_string());
        }
    }
    if let Some(about) = &body.about {
        query = query.bind(about.clone());
    }
    if let Some(color) = body.avatar_color {
        query = query.bind(color);
    }
    if let Some(ph) = &password_hash_val {
        query = query.bind(ph.clone());
    }
    if let Some(avatar_url) = &body.avatar_url {
        query = query.bind(avatar_url.clone());
    }
    if let Some(banner_url) = &body.banner_url {
        query = query.bind(banner_url.clone());
    }

    query = query.bind(&claims.sub);

    match query.execute(pool.get_ref()).await {
        Ok(_) => {
            // Fetch updated user to broadcast
            let user_row = sqlx::query("SELECT username, role, about, avatar_color, avatar_url, banner_url FROM users WHERE id = ?")
                .bind(&claims.sub)
                .fetch_optional(pool.get_ref())
                .await
                .unwrap_or(None);

            if let Some(row) = user_row {
                 use sqlx::Row;
                 let username: String = row.get("username");
                 let role: String = row.get("role");
                 let about: String = row.get("about");
                 let avatar_color: i32 = row.try_get("avatar_color").unwrap_or(0);
                 let avatar_url: Option<String> = row.try_get("avatar_url").unwrap_or(None);
                 let banner_url: Option<String> = row.try_get("banner_url").unwrap_or(None);

                 let event = serde_json::json!({
                     "type": "join", // handled as upsert by frontend
                     "user_id": claims.sub,
                     "username": username,
                     "role": role,
                     "about": about,
                     "avatar_color": avatar_color,
                     "avatar_url": avatar_url,
                     "banner_url": banner_url
                 });
                 let _ = broadcaster.send(event.to_string());
            }

            HttpResponse::Ok().json(serde_json::json!({ "status": "updated" }))
        },
        Err(e) => {
            eprintln!("Profile update error: {:?}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({ "error": "Update failed (username might be taken)" }))
        }
    }
}

#[derive(Deserialize)]
pub struct UpdateRole {
    pub role: String,
}

#[derive(Debug, Serialize)]
pub struct ServerRole {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateServerRole {
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ServerUser {
    pub id: String,
    pub username: String,
    pub role: String,
}

/// GET /api/server/roles — List roles (Admin only)
pub async fn list_server_roles(
    req: HttpRequest,
    pool: web::Data<SqlitePool>,
) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().finish(),
    };

    if claims.role != "admin" {
        return HttpResponse::Forbidden().json(serde_json::json!({ "error": "Admin only" }));
    }

    let rows = sqlx::query("SELECT name, color FROM roles ORDER BY CASE WHEN name='admin' THEN 0 WHEN name='user' THEN 1 ELSE 2 END, name ASC")
        .fetch_all(pool.get_ref())
        .await;

    match rows {
        Ok(rows) => {
            let roles: Vec<ServerRole> = rows
                .into_iter()
                .map(|row| ServerRole {
                    name: row.get("name"),
                    color: row.get("color"),
                })
                .collect();
            HttpResponse::Ok().json(roles)
        }
        Err(_) => HttpResponse::InternalServerError().finish(),
    }
}

/// POST /api/server/roles — Create role (Admin only)
pub async fn create_server_role(
    req: HttpRequest,
    pool: web::Data<SqlitePool>,
    body: web::Json<CreateServerRole>,
) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().finish(),
    };

    if claims.role != "admin" {
        return HttpResponse::Forbidden().json(serde_json::json!({ "error": "Admin only" }));
    }

    let role_name = body.name.trim().to_lowercase();
    if role_name.len() < 2 || role_name.len() > 24 {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": "Role name must be 2 to 24 chars" }));
    }
    if !role_name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": "Role name can only contain a-z, 0-9, _ and -" }));
    }

    let color = body
        .color
        .as_deref()
        .unwrap_or("#99aab5")
        .trim()
        .to_string();

    if color.len() != 7 || !color.starts_with('#') || !color.chars().skip(1).all(|c| c.is_ascii_hexdigit()) {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": "Invalid role color (expected #RRGGBB)" }));
    }

    let result = sqlx::query("INSERT INTO roles (name, color) VALUES (?, ?)")
        .bind(&role_name)
        .bind(&color)
        .execute(pool.get_ref())
        .await;

    match result {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({ "status": "role created" })),
        Err(_) => HttpResponse::Conflict().json(serde_json::json!({ "error": "Role already exists" })),
    }
}

/// DELETE /api/server/roles/{name} — Delete role (Admin only)
pub async fn delete_server_role(
    req: HttpRequest,
    pool: web::Data<SqlitePool>,
    path: web::Path<String>,
    access_cache: web::Data<crate::ws::AccessCache>,
) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().finish(),
    };

    if claims.role != "admin" {
        return HttpResponse::Forbidden().json(serde_json::json!({ "error": "Admin only" }));
    }

    let role_name = path.into_inner().trim().to_lowercase();
    if role_name == "admin" || role_name == "user" {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": "This role is protected" }));
    }

    let _ = sqlx::query("UPDATE users SET role = 'user' WHERE role = ?")
        .bind(&role_name)
        .execute(pool.get_ref())
        .await;

    crate::ws::cache_clear_user_roles(access_cache.get_ref());

    let result = sqlx::query("DELETE FROM roles WHERE name = ?")
        .bind(&role_name)
        .execute(pool.get_ref())
        .await;

    match result {
        Ok(res) => {
            if res.rows_affected() > 0 {
                HttpResponse::Ok().json(serde_json::json!({ "status": "role deleted" }))
            } else {
                HttpResponse::NotFound().json(serde_json::json!({ "error": "Role not found" }))
            }
        }
        Err(_) => HttpResponse::InternalServerError().finish(),
    }
}

/// GET /api/server/users — List users with role (Admin only)
pub async fn list_server_users(
    req: HttpRequest,
    pool: web::Data<SqlitePool>,
) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().finish(),
    };

    if claims.role != "admin" {
        return HttpResponse::Forbidden().json(serde_json::json!({ "error": "Admin only" }));
    }

    let rows = sqlx::query("SELECT id, username, role FROM users ORDER BY username ASC")
        .fetch_all(pool.get_ref())
        .await;

    match rows {
        Ok(rows) => {
            let users: Vec<ServerUser> = rows
                .into_iter()
                .map(|row| ServerUser {
                    id: row.get("id"),
                    username: row.get("username"),
                    role: row.get("role"),
                })
                .collect();
            HttpResponse::Ok().json(users)
        }
        Err(_) => HttpResponse::InternalServerError().finish(),
    }
}

/// PATCH /api/users/{id}/role — Promote/Demote user (Admin only)
pub async fn update_user_role(
    req: HttpRequest,
    pool: web::Data<SqlitePool>,
    path: web::Path<String>,
    body: web::Json<UpdateRole>,
    broadcaster: web::Data<crate::ws::Broadcaster>,
    access_cache: web::Data<crate::ws::AccessCache>,
) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().finish(),
    };

    if claims.role != "admin" {
        return HttpResponse::Forbidden().json(serde_json::json!({ "error": "Admin only" }));
    }

    let target_id = path.into_inner();
    let new_role = &body.role;

    let role_exists = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM roles WHERE name = ?")
        .bind(new_role)
        .fetch_one(pool.get_ref())
        .await
        .unwrap_or(0);

    if role_exists <= 0 {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": "Invalid role" }));
    }

    let result = sqlx::query("UPDATE users SET role = ? WHERE id = ?")
        .bind(new_role)
        .bind(&target_id)
        .execute(pool.get_ref())
        .await;

    match result {
        Ok(_) => {
            // Fetch updated user to broadcast
            let user_row = sqlx::query("SELECT username, role, about, avatar_color, avatar_url, banner_url FROM users WHERE id = ?")
                .bind(&target_id)
                .fetch_optional(pool.get_ref())
                .await
                .unwrap_or(None);

            if let Some(row) = user_row {
                 use sqlx::Row;
                 let username: String = row.get("username");
                 let role: String = row.get("role");
                 let about: String = row.get("about");
                 let avatar_color: i32 = row.try_get("avatar_color").unwrap_or(0);
                 let avatar_url: Option<String> = row.try_get("avatar_url").unwrap_or(None);
                 let banner_url: Option<String> = row.try_get("banner_url").unwrap_or(None);

                  crate::ws::cache_set_user_role(access_cache.get_ref(), &target_id, &role);

                 let event = serde_json::json!({
                     "type": "join", // handled as upsert by frontend
                     "user_id": target_id,
                     "username": username,
                     "role": role,
                     "about": about,
                     "avatar_color": avatar_color,
                     "avatar_url": avatar_url,
                     "banner_url": banner_url
                 });
                 let _ = broadcaster.send(event.to_string());
            }
            HttpResponse::Ok().json(serde_json::json!({ "status": "role updated" }))
        },
        Err(_) => HttpResponse::InternalServerError().finish(),
    }
}

/// DELETE /api/users/{id} — Delete a user (Admin only)
pub async fn delete_user(
    req: HttpRequest,
    pool: web::Data<SqlitePool>,
    path: web::Path<String>,
) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().finish(),
    };

    if claims.role != "admin" {
        return HttpResponse::Forbidden().json(serde_json::json!({ "error": "Admin only" }));
    }

    let target_id = path.into_inner();

    // Delete messages first
    let _ = sqlx::query("DELETE FROM messages WHERE user_id = ?")
        .bind(&target_id)
        .execute(pool.get_ref())
        .await;

    // Delete user
    let result = sqlx::query("DELETE FROM users WHERE id = ?")
        .bind(&target_id)
        .execute(pool.get_ref())
        .await;

    match result {
        Ok(res) => {
            if res.rows_affected() > 0 {
                HttpResponse::Ok().json(serde_json::json!({ "status": "deleted" }))
            } else {
                HttpResponse::NotFound().json(serde_json::json!({ "error": "User not found" }))
            }
        }
        Err(_) => HttpResponse::InternalServerError().finish(),
    }
}
