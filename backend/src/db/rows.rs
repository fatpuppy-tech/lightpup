use sqlx::sqlite::SqliteRow;
use sqlx::{FromRow, Row};

use super::types::{Application, Environment, Node, User};

// ---- Row helpers (sqlx uses i32 for INTEGER; we expose bool for is_production / is_active) ----

#[derive(FromRow)]
pub(crate) struct NodeRow {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) address: String,
    pub(crate) ssh_user: Option<String>,
    pub(crate) ssh_key_path: Option<String>,
    pub(crate) ssh_key_content: Option<String>,
    pub(crate) is_active: i32,
    pub(crate) created_at: String,
}

impl From<NodeRow> for Node {
    fn from(r: NodeRow) -> Self {
        Node {
            id: r.id,
            name: r.name,
            address: r.address,
            ssh_user: r.ssh_user,
            ssh_key_path: r.ssh_key_path,
            ssh_key_content: r.ssh_key_content,
            is_active: r.is_active != 0,
            created_at: r.created_at,
        }
    }
}

#[derive(FromRow)]
pub(crate) struct UserRow {
    pub(crate) id: String,
    pub(crate) username: String,
    pub(crate) password_hash: String,
    pub(crate) totp_secret: Option<String>,
    pub(crate) created_at: String,
}

impl From<UserRow> for User {
    fn from(r: UserRow) -> Self {
        User {
            id: r.id,
            username: r.username,
            password_hash: r.password_hash,
            totp_secret: r.totp_secret,
            created_at: r.created_at,
        }
    }
}

#[derive(FromRow)]
pub(crate) struct EnvironmentRow {
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) name: String,
    pub(crate) is_production: i32,
    pub(crate) created_at: String,
}

impl From<EnvironmentRow> for Environment {
    fn from(r: EnvironmentRow) -> Self {
        Environment {
            id: r.id,
            project_id: r.project_id,
            name: r.name,
            is_production: r.is_production != 0,
            created_at: r.created_at,
        }
    }
}

/// Application has port as `u16`; sqlx returns `i32` from `INTEGER`.
pub(crate) fn application_from_row(row: SqliteRow) -> Application {
    Application {
        id: row.get("id"),
        environment_id: row.get("environment_id"),
        name: row.get("name"),
        domain: row.get("domain"),
        image: row.get("image"),
        port: row.get::<i32, _>("port") as u16,
        status: row.get("status"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        repo_url: row.get("repo_url"),
        repo_branch: row.get("repo_branch"),
        dockerfile_path: row.get("dockerfile_path"),
        build_type: row
            .try_get("build_type")
            .unwrap_or_else(|_| "static".to_string()),
        node_id: row.try_get("node_id").ok(),
    }
}
