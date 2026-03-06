-- Multi-user: add role to users (admin, member, viewer).
-- Existing users (e.g. first one from setup) will get 'admin' when we create them with role in code.
-- For any existing DB that already has users without role column, default to 'admin' so current user keeps full access.

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin';
-- Normalize: only allow admin, member, viewer
UPDATE users SET role = 'admin' WHERE role NOT IN ('admin', 'member', 'viewer');
