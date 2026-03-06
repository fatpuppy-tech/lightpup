-- Fine-grained permissions per user (additive to role).
-- e.g. terminal = server terminal access, manage_servers = create/edit/delete servers.
-- Admins have all permissions; member/viewer can be granted specific ones.

CREATE TABLE IF NOT EXISTS user_permissions (
    user_id TEXT NOT NULL,
    permission TEXT NOT NULL,
    PRIMARY KEY (user_id, permission),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
