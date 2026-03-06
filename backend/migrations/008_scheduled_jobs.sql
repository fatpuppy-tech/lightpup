-- Cron jobs: run a deployment on schedule (e.g. "0 * * * *" = hourly at :00).
CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    name TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    last_run_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_application ON scheduled_jobs(application_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs(enabled) WHERE enabled = 1;
