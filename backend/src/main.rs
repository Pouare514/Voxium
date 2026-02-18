mod auth;
mod db;
mod messages;
mod rooms;
mod uploads;
mod ws;

use actix_cors::Cors;
use actix_files::Files;
use actix_web::{web, App, HttpResponse, HttpServer};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenvy::dotenv().ok();

    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let bind_addr = format!("0.0.0.0:{}", port);

    let pool = db::init_db().await;
    let broadcaster = ws::create_broadcaster();
    let online_users = ws::create_online_users();
    let access_cache = ws::create_access_cache();

    // Ensure uploads directory exists
    std::fs::create_dir_all("uploads").ok();

    println!("🚀 Backend running at http://{}", bind_addr);

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .wrap(cors)
            .app_data(web::Data::new(pool.clone()))
            .app_data(web::Data::new(broadcaster.clone()))
            .app_data(web::Data::new(online_users.clone()))
            .app_data(web::Data::new(access_cache.clone()))
            .route("/api/health", web::get().to(|| async {
                HttpResponse::Ok().json(serde_json::json!({ "status": "ok" }))
            }))
            // Auth
            .route("/api/register", web::post().to(auth::register))
            .route("/api/login", web::post().to(auth::login))
            .route("/api/auth/discord/config", web::get().to(auth::get_discord_oauth_config))
            .route("/api/auth/discord/exchange", web::post().to(auth::exchange_discord_oauth))
            .route("/api/users/me", web::get().to(auth::get_me))
            .route("/api/users/me", web::patch().to(auth::update_profile))
            .route("/api/discord/me", web::get().to(auth::get_discord_me))
            .route("/api/discord/proxy", web::post().to(auth::discord_proxy))
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
            // Serve uploaded files
            .service(Files::new("/uploads", "uploads"))
            // WebSocket
            .route("/ws", web::get().to(ws::ws_handler))
    })
    .bind(&bind_addr)?
    .run()
    .await
}
