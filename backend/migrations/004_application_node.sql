-- Assign applications to a specific server (node) for deployment.
-- NULL = deploy to first active remote server or local Docker.

ALTER TABLE applications
    ADD COLUMN node_id TEXT REFERENCES nodes(id);

CREATE INDEX IF NOT EXISTS idx_applications_node ON applications(node_id);
