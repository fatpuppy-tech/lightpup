-- Add docker compose and dockerfile content fields
ALTER TABLE applications ADD COLUMN dockerfile_content TEXT;
ALTER TABLE applications ADD COLUMN docker_compose_content TEXT;
