use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use std::path::Path;

/// Create the SQLite connection pool and run migrations.
pub async fn init_db() -> SqlitePool {
    dotenvy::dotenv().ok();
    let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:discord2.db".into());

    // Create the DB file if it doesn't exist
    let db_path = database_url.trim_start_matches("sqlite:");
    if !Path::new(db_path).exists() {
        std::fs::File::create(db_path).expect("Failed to create database file");
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("Failed to connect to SQLite");

    // Run migrations
    let migration_sql = include_str!("../../migrations/001_init.sql");
    for statement in migration_sql.split(';') {
        let trimmed = statement.trim();
        if !trimmed.is_empty() {
            sqlx::query(trimmed).execute(&pool).await.ok(); // Ignore errors if table exists
        }
    }

    let migration_002 = include_str!("../../migrations/002_add_settings.sql");
    for statement in migration_002.split(';') {
        let trimmed = statement.trim();
        if !trimmed.is_empty() {
             // We use ok() because columns might already exist if run multiple times
             // In a real app we'd use a migrations table to track versions
            sqlx::query(trimmed).execute(&pool).await.ok();
        }
    }

    let migration_003 = include_str!("../../migrations/003_add_images.sql");
    for statement in migration_003.split(';') {
        let trimmed = statement.trim();
        if !trimmed.is_empty() {
            sqlx::query(trimmed).execute(&pool).await.ok();
        }
    }

    let migration_004 = include_str!("../../migrations/004_add_avatar_url.sql");
    for statement in migration_004.split(';') {
        let trimmed = statement.trim();
        if !trimmed.is_empty() {
            sqlx::query(trimmed).execute(&pool).await.ok();
        }
    }

    let migration_005 = include_str!("../../migrations/005_add_room_kind.sql");
    for statement in migration_005.split(';') {
        let trimmed = statement.trim();
        if !trimmed.is_empty() {
            sqlx::query(trimmed).execute(&pool).await.ok();
        }
    }

    let migration_006 = include_str!("../../migrations/006_add_banner_url.sql");
    for statement in migration_006.split(';') {
        let trimmed = statement.trim();
        if !trimmed.is_empty() {
            sqlx::query(trimmed).execute(&pool).await.ok();
        }
    }

    let migration_007 = include_str!("../../migrations/007_add_room_required_role.sql");
    for statement in migration_007.split(';') {
        let trimmed = statement.trim();
        if !trimmed.is_empty() {
            sqlx::query(trimmed).execute(&pool).await.ok();
        }
    }

    let migration_008 = include_str!("../../migrations/008_add_message_reply.sql");
    for statement in migration_008.split(';') {
        let trimmed = statement.trim();
        if !trimmed.is_empty() {
            sqlx::query(trimmed).execute(&pool).await.ok();
        }
    }

    let migration_009 = include_str!("../../migrations/009_add_message_pins.sql");
    for statement in migration_009.split(';') {
        let trimmed = statement.trim();
        if !trimmed.is_empty() {
            sqlx::query(trimmed).execute(&pool).await.ok();
        }
    }

    let migration_010 = include_str!("../../migrations/010_add_server_roles.sql");
    for statement in migration_010.split(';') {
        let trimmed = statement.trim();
        if !trimmed.is_empty() {
            sqlx::query(trimmed).execute(&pool).await.ok();
        }
    }

    println!("✅ Database initialized");
    pool
}
