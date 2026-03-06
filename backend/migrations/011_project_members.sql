-- Project-level access: restrict users to specific projects with a role per project.
-- If a user has no rows here, they use their global role (admin/member/viewer) for all projects.

CREATE TABLE IF NOT EXISTS project_members (
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, project_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
