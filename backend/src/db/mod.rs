//! Database layer using sqlx (type-safe, async). Pool is shared via `AppState`.
//!
//! This module intentionally stays small; functionality is split into focused
//! submodules (queries + shared row mapping + public domain types).

mod applications;
mod auth;
mod dashboard;
mod deployments;
mod environments;
mod nodes;
mod previews;
mod projects;
mod rows;
mod settings;
mod types;

use sqlx::sqlite::SqlitePool;

pub use types::{
    Application, Deployment, Environment, Node, PreviewEnvironment, Project, ProxyAppRow, User,
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
