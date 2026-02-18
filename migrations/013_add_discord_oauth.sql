ALTER TABLE users ADD COLUMN discord_id TEXT;
ALTER TABLE users ADD COLUMN discord_access_token TEXT;
ALTER TABLE users ADD COLUMN discord_refresh_token TEXT;
ALTER TABLE users ADD COLUMN discord_token_expires_at INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_id
ON users(discord_id)
WHERE discord_id IS NOT NULL;
