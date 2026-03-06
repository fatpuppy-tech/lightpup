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
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub repo_url: Option<String>,
    pub repo_branch: Option<String>,
    pub dockerfile_path: Option<String>,
    /// Build pack / strategy, e.g. "static", "docker", "docker_compose", "railpack".
    pub build_type: String,
    /// Server (node) to deploy to. None = first active remote or local Docker.
    #[serde(rename = "server_id")]
    pub node_id: Option<String>,
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
    pub created_at: String,
}
