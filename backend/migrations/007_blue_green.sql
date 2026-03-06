-- Blue-green deploy: two slots per app (primary + staging), live_slot indicates which receives traffic.
-- Optional: health check path/timeout, and which deployment is currently live.

ALTER TABLE applications ADD COLUMN port_staging INTEGER;
ALTER TABLE applications ADD COLUMN live_slot TEXT DEFAULT 'primary';

-- Existing rows: set staging port so each app has two ports (may clash if adjacent ports used; new apps get proper allocation).
UPDATE applications SET port_staging = port + 1 WHERE port_staging IS NULL;

-- Optional: track live deployment and health check config
ALTER TABLE applications ADD COLUMN live_deployment_id TEXT;
ALTER TABLE applications ADD COLUMN health_path TEXT;
ALTER TABLE applications ADD COLUMN health_timeout_secs INTEGER;
