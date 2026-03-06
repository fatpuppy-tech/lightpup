-- Project-level and application-level environment variables (injected into containers at deploy).

CREATE TABLE IF NOT EXISTS project_env (
    project_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (project_id, key),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS application_env (
    application_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (application_id, key),
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_env_project ON project_env(project_id);
CREATE INDEX IF NOT EXISTS idx_application_env_app ON application_env(application_id);
