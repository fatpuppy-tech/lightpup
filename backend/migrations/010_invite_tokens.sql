-- Invite tokens: generate link or send email; user sets password when accepting.

CREATE TABLE IF NOT EXISTS invite_tokens (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    role TEXT NOT NULL,
    email TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON invite_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_expires ON invite_tokens(expires_at);
