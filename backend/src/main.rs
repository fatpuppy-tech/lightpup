use axum::Router;
use axum::routing::get;
use lightpup::{api, db, docker::DockerManager, proxy, tls::TlsManager, AppState};
use std::{net::SocketAddr, sync::Arc};
use tower_http::services::ServeDir;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqliteSynchronous};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting LightPup v{}", env!("CARGO_PKG_VERSION"));

    let data_dir = directories::ProjectDirs::from("com", "lightpup", "lightpup")
        .map(|d| d.data_dir().to_path_buf())
        .unwrap_or_else(|| std::env::current_dir().unwrap().join("data"));

    std::fs::create_dir_all(&data_dir)?;
    tracing::info!("Data directory: {:?}", data_dir);

    let db_path = data_dir.join("lightpup.db");
    let pool = SqlitePool::connect_with(
        SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Normal),
    )
    .await?;
    let migrations_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("migrations");
    let migrator = sqlx::migrate::Migrator::new(migrations_dir).await?;
    migrator.run(&pool).await?;
    let db = db::Database::new(pool);

    let docker = match DockerManager::new().await {
        Ok(d) => {
            tracing::info!("Docker connected successfully");
            Some(d)
        }
        Err(e) => {
            tracing::warn!("Docker not available: {}", e);
            None
        }
    };

    let tls = Arc::new(TlsManager::new(data_dir.clone()));

    let state = AppState {
        db: Arc::new(db),
        docker: Arc::new(docker),
        tls: tls.clone(),
    };

    let app = Router::new()
        .route("/health", get(health))
        .merge(api::routes(state.clone()))
        .nest_service(
            "/ui",
            ServeDir::new(std::env::current_dir()?.join("../frontend/dist")),
        )
        .fallback(proxy::proxy_request)
        .with_state(state.clone());

    tokio::spawn(api::deploy::run_cron_loop(state.clone()));
    tracing::info!("Cron scheduler started");

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    tracing::info!("HTTP server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn health() -> &'static str {
    "OK"
}

async fn shutdown_signal() {
    use tokio::signal::unix::{signal, SignalKind};

    let mut term = signal(SignalKind::terminate()).unwrap();
    let mut int = signal(SignalKind::interrupt()).unwrap();

    tokio::select! {
        _ = term.recv() => tracing::info!("Received SIGTERM"),
        _ = int.recv() => tracing::info!("Received SIGINT"),
    }

    tracing::info!("Shutting down...");
}
