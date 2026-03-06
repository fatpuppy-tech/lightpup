use sqlx::FromRow;

// ---- Public domain types (serde for API) ----

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, FromRow)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Environment {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub is_production: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Application {
    pub id: String,
    pub environment_id: String,
    pub name: String,
    pub domain: Option<String>,
    pub image: String,
    pub port: u16,
    /// Second port for blue-green; proxy uses port or port_staging based on live_slot.
    pub port_staging: u16,
    /// Which slot is live: "primary" (port) or "secondary" (port_staging).
    pub live_slot: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub repo_url: Option<String>,
    pub repo_branch: Option<String>,
    pub dockerfile_path: Option<String>,
    pub dockerfile_content: Option<String>,
    pub docker_compose_content: Option<String>,
    /// Build pack / strategy, e.g. "static", "docker", "docker_compose", "railpack".
    pub build_type: String,
    /// Server (node) to deploy to. None = first active remote or local Docker.
    #[serde(rename = "server_id")]
    pub node_id: Option<String>,
    /// Deployment currently receiving traffic (for UI).
    pub live_deployment_id: Option<String>,
    /// Health check path, e.g. "/health". Default used if None.
    pub health_path: Option<String>,
    /// Health check timeout in seconds. Default if None.
    pub health_timeout_secs: Option<i32>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, FromRow)]
pub struct Deployment {
    pub id: String,
    pub application_id: String,
    pub version: String,
    pub status: String,
    pub logs: Option<String>,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, FromRow)]
pub struct PreviewEnvironment {
    pub id: String,
    pub application_id: String,
    pub branch: String,
    pub url: String,
    pub status: String,
    pub expires_at: Option<String>,
    pub created_at: String,
    /// Host port for the preview container (set after successful run).
    pub host_port: Option<i32>,
    /// Docker container id (set after successful run; used for stop/remove on delete).
    pub container_id: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, FromRow)]
pub struct ScheduledJob {
    pub id: String,
    pub application_id: String,
    pub name: String,
    pub cron_expression: String,
    pub enabled: i32,
    pub last_run_at: Option<String>,
    pub created_at: String,
}

/// One row for proxy app list (db layer); API maps to ProxyAppSummary.
#[derive(Debug, Clone, FromRow)]
pub struct ProxyAppRow {
    pub id: String,
    pub name: String,
    pub domain: Option<String>,
    pub port: i32,
    pub status: String,
    pub environment_name: String,
    pub project_name: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Node {
    pub id: String,
    pub name: String,
    pub address: String,
    pub ssh_user: Option<String>,
    pub ssh_key_path: Option<String>,
    pub ssh_key_content: Option<String>,
    pub is_active: bool,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct User {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub totp_secret: Option<String>,
    pub role: String,
    pub created_at: String,
}
