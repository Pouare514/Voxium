use sqlx::{Pool, Sqlite, sqlite::{SqlitePool, SqlitePoolOptions}};
use std::{fs, path::Path};

/// Create the SQLite connection pool and run migrations.
pub async fn init_db() -> SqlitePool {
    dotenvy::dotenv().ok();
    let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:voxium.db".into());
    let max_connections = std::env::var("DB_MAX_CONNECTIONS")
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(16);

    // Create the DB file if it doesn't exist
    let db_path = database_url.trim_start_matches("sqlite:");
    if !Path::new(db_path).exists() {
        std::fs::File::create(db_path).expect("Failed to create database file");
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(max_connections)
        .connect(&database_url)
        .await
        .expect("Failed to connect to SQLite");

    let _ = sqlx::query("PRAGMA journal_mode=WAL")
        .execute(&pool)
        .await;
    let _ = sqlx::query("PRAGMA synchronous=NORMAL")
        .execute(&pool)
        .await;
    let _ = sqlx::query("PRAGMA temp_store=MEMORY")
        .execute(&pool)
        .await;
    let _ = sqlx::query("PRAGMA busy_timeout=5000")
        .execute(&pool)
        .await;
    let _ = sqlx::query("PRAGMA cache_size=-20000")
        .execute(&pool)
        .await;

   let files = [
       "../../migrations/001_init.sql",
       "../../migrations/002_add_settings.sql",
       "../../migrations/003_add_images.sql",
       "../../migrations/004_add_avatar_url.sql",
       "../../migrations/005_add_room_kind.sql",
       "../../migrations/006_add_banner_url.sql",
       "../../migrations/007_add_room_required_role.sql",
       "../../migrations/008_add_message_reply.sql",
       "../../migrations/009_add_message_pins.sql",
       "../../migrations/010_add_server_roles.sql",
       "../../migrations/011_add_message_reactions.sql",
    ];

   for file in files {
     migration(file, &pool).await;
   }

    let migration_013 = include_str!("../../migrations/013_add_discord_oauth.sql");
    for statement in migration_013.split(';') {
        let trimmed = statement.trim();
        if !trimmed.is_empty() {
            sqlx::query(trimmed).execute(&pool).await.ok();
        }
    }

    println!("✅ Database initialized");
    pool
}

async fn migration(path: &str, pool: &Pool<Sqlite>) {
  let migration = fs::read_to_string(path);
  match migration {
    Ok(migration_content) => {
      for statement in migration_content.split(';') {
        let trimmed = statement.trim();
        if !trimmed.is_empty() {
            sqlx::query(trimmed).execute(pool).await.ok();
        }
      }
    }
    Err(e) => { print!("Erreur lors de la lecture du fichier : {}", e)}
  }
}
