pub mod api;
pub mod db;
pub mod docker;
pub mod scheduler;
pub mod proxy;
pub mod crypto;
pub mod sync;
pub mod tls;

pub use anyhow::Result;
pub use thiserror::Error;

use std::sync::Arc;

pub use db::Database;
pub use docker::DockerManager;
pub use tls::TlsManager;

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Database>,
    pub docker: Arc<Option<DockerManager>>,
    pub tls: Arc<TlsManager>,
}

#[derive(Error, Debug)]
pub enum Error {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    
    #[error("Docker error: {0}")]
    Docker(String),
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("Not found: {0}")]
    NotFound(String),
    
    #[error("Already exists: {0}")]
    AlreadyExists(String),
    
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    
    #[error("Internal: {0}")]
    Internal(String),
}

impl serde::Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = std::result::Result<T, Error>;
