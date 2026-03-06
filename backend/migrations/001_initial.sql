-- LightPup schema (full; new installs get everything).
-- Existing DBs from rusqlite already have these tables/columns; IF NOT EXISTS / no-op ALTERs below.
-- PRAGMA journal_mode and synchronous are set on the connection in main.rs (cannot run inside a transaction).

CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    ssh_user TEXT,
    ssh_key_path TEXT,
    ssh_key_content TEXT
);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS environments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_production INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    environment_id TEXT NOT NULL,
    name TEXT NOT NULL,
    domain TEXT,
    image TEXT NOT NULL,
    port INTEGER DEFAULT 80,
    status TEXT DEFAULT 'stopped',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    repo_url TEXT,
    repo_branch TEXT,
    dockerfile_path TEXT,
    FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    version TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    logs TEXT,
    started_at TEXT,
    finished_at TEXT,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS preview_environments (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    branch TEXT NOT NULL,
    url TEXT NOT NULL,
    status TEXT DEFAULT 'running',
    expires_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS domains (
    id TEXT PRIMARY KEY,
    application_id TEXT,
    domain TEXT NOT NULL,
    cert_path TEXT,
    key_path TEXT,
    is_ssl INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS secrets (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    UNIQUE(application_id, key)
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_environments_project ON environments(project_id);
CREATE INDEX IF NOT EXISTS idx_applications_environment ON applications(environment_id);
CREATE INDEX IF NOT EXISTS idx_deployments_application ON deployments(application_id);
CREATE INDEX IF NOT EXISTS idx_preview_application ON preview_environments(application_id);
