-- Add host port and container id to preview environments for build+run lifecycle.
ALTER TABLE preview_environments ADD COLUMN host_port INTEGER;
ALTER TABLE preview_environments ADD COLUMN container_id TEXT;
