pub mod auth;
pub mod db;
pub mod discord_gateway;
pub mod messages;
pub mod remote_auth;
pub mod rooms;
pub mod uploads;
pub mod ws;
pub mod crypto;

use actix_cors::Cors;
use actix_files::Files;
use actix_web::{web, App, HttpResponse, HttpServer};

/// Run the backend HTTP server. This function blocks until the server shuts down.
/// It creates its own Actix/Tokio runtime via `#[actix_web::main]`.
pub fn run_server() {
    let rt = actix_web::rt::System::new();
    rt.block_on(async {
        start_server().await.expect("Backend server failed");
    });
}

async fn start_server() -> std::io::Result<()> {
    dotenvy::dotenv().ok();

    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let bind_addr = format!("0.0.0.0:{}", port);

    let pool = db::init_db().await;
    let broadcaster = ws::create_broadcaster();
    let online_users = ws::create_online_users();
    let access_cache = ws::create_access_cache();
    let qr_sessions = remote_auth::create_qr_sessions();
    let discord_gateways = discord_gateway::create_discord_gateways();

    // Ensure uploads directory exists
    std::fs::create_dir_all("uploads").ok();

    println!("🚀 Backend running at http://{}", bind_addr);

    HttpServer::new(move || {
        // CORS: Restrict to Tauri and local dev
        let cors = Cors::default()
            .allowed_origin("tauri://localhost")
            .allowed_origin("http://localhost:1420")
            .allowed_origin("http://127.0.0.1:1420")
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        // Rate Limiting: 10 req/s with burst of 20
        let governor_conf = actix_governor::GovernorConfigBuilder::default()
            .per_second(10)
            .burst_size(20)
            .finish()
            .unwrap();

        App::new()
            .wrap(cors)
            .wrap(actix_governor::Governor::new(&governor_conf))
            .app_data(web::Data::new(pool.clone()))
            .app_data(web::Data::new(broadcaster.clone()))
            .app_data(web::Data::new(online_users.clone()))
            .app_data(web::Data::new(access_cache.clone()))
            .app_data(web::Data::new(qr_sessions.clone()))
            .app_data(web::Data::new(discord_gateways.clone()))
            .route("/api/health", web::get().to(|| async {
                HttpResponse::Ok().json(serde_json::json!({ "status": "ok" }))
            }))
            // Auth
            .route("/api/register", web::post().to(auth::register))
            .route("/api/login", web::post().to(auth::login))
            .route("/api/auth/discord/token", web::post().to(auth::login_discord_token))
            .route("/api/auth/discord/qr/start", web::post().to(remote_auth::start_qr_session))
            .route("/api/auth/discord/qr/status", web::get().to(remote_auth::get_qr_status))
            .route("/api/auth/discord/qr/cancel", web::post().to(remote_auth::cancel_qr_session))
            .route("/api/users/me", web::get().to(auth::get_me))
            .route("/api/users/me", web::patch().to(auth::update_profile))
            .route("/api/discord/me", web::get().to(auth::get_discord_me))
            .route("/api/discord/proxy", web::post().to(auth::discord_proxy))
            .route("/api/discord/voice/join", web::post().to(discord_gateway::voice_join))
            .route("/api/discord/voice/leave", web::post().to(discord_gateway::voice_leave))
            .route(
                "/api/discord/voice/participants",
                web::get().to(discord_gateway::voice_participants),
            )
            .route("/api/users/{id}", web::delete().to(auth::delete_user))
            .route("/api/users/{id}/role", web::patch().to(auth::update_user_role))
            .route("/api/server/roles", web::get().to(auth::list_server_roles))
            .route("/api/server/roles", web::post().to(auth::create_server_role))
            .route("/api/server/roles/{name}", web::delete().to(auth::delete_server_role))
            .route("/api/server/users", web::get().to(auth::list_server_users))
            // Rooms
            .route("/api/rooms", web::get().to(rooms::list_rooms))
            .route("/api/rooms", web::post().to(rooms::create_room))
            .route("/api/rooms/{id}", web::patch().to(rooms::update_room))
            .route("/api/rooms/{id}", web::delete().to(rooms::delete_room))
            // Messages
            .route("/api/messages/{id}", web::delete().to(messages::delete_message))
            .route("/api/messages/{id}/reactions", web::post().to(messages::add_reaction))
            .route("/api/messages/{id}/reactions", web::delete().to(messages::remove_reaction))
            .route("/api/messages/search", web::get().to(messages::search_messages))
            .route("/api/messages/{id}/pin", web::post().to(messages::pin_message))
            .route("/api/messages/{id}/pin", web::delete().to(messages::unpin_message))
            .route("/api/users/{id}/messages", web::delete().to(messages::delete_user_messages))
            .route("/api/rooms/{room_id}/messages", web::get().to(messages::get_messages))
            .route("/api/rooms/{room_id}/pins", web::get().to(messages::get_pinned_messages))
            // Uploads
            .route("/api/upload", web::post().to(uploads::upload_image))
            // Serve uploaded files - DISABLE directory listing if enabled by default, but actix-files doesn't by default
            .service(Files::new("/uploads", "uploads"))
            // WebSocket
            .route("/ws", web::get().to(ws::ws_handler))
    })
    .bind(&bind_addr)?
    .run()
    .await
}
