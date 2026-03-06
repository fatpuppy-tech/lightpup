//! Database layer using sqlx (type-safe, async). Pool is shared via `AppState`.
//!
//! This module intentionally stays small; functionality is split into focused
//! submodules (queries + shared row mapping + public domain types).

mod applications;
mod auth;
mod dashboard;
mod deployments;
mod env_vars;
mod environments;
pub mod invite_tokens;
mod nodes;
mod previews;
mod project_members;
mod projects;
mod rows;
mod scheduled_jobs;
mod settings;
mod types;
mod user_permissions;

use sqlx::sqlite::SqlitePool;

pub use env_vars::EnvVar;
pub use types::{
    Application, Deployment, Environment, Node, PreviewEnvironment, Project, ProxyAppRow,
    ScheduledJob, User,
};

/// Primary entry point for DB access. All query methods are implemented across
/// the `db/*` modules via multiple `impl Database { .. }` blocks.
pub struct Database {
    pub pool: SqlitePool,
}

impl Database {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}
