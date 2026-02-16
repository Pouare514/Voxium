CREATE TABLE IF NOT EXISTS roles (
    name TEXT PRIMARY KEY,
    color TEXT NOT NULL DEFAULT '#99aab5',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO roles (name, color) VALUES ('user', '#99aab5');
INSERT OR IGNORE INTO roles (name, color) VALUES ('admin', '#ed4245');
