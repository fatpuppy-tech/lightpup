//! Integration tests for deployment DB operations using an in-memory SQLite database.

use lightpup::db::Database;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqliteSynchronous};
use std::str::FromStr;

async fn setup_db() -> Database {
    let opts = SqliteConnectOptions::from_str("sqlite::memory:")
        .unwrap()
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal);
    let pool = SqlitePool::connect_with(opts).await.unwrap();
    let migrations = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("migrations");
    let migrator = sqlx::migrate::Migrator::new(migrations).await.unwrap();
    migrator.run(&pool).await.unwrap();
    Database::new(pool)
}

#[tokio::test]
async fn test_create_and_get_deployment() {
    let db = setup_db().await;

    let project_id = "test-project-1";
    let env_id = "test-env-1";
    let app_id = "test-app-1";
    let deploy_id = "test-deploy-1";

    db.create_project(project_id, "Test Project", None)
        .await
        .unwrap();
    db.create_environment(env_id, project_id, "staging", false)
        .await
        .unwrap();
    db.create_application(
        app_id,
        env_id,
        "test-app",
        None,
        "nginx:latest",
        80,
        None,
        None,
        None,
        "static",
        None,
    )
    .await
    .unwrap();

    db.create_deployment(deploy_id, app_id, "v1")
        .await
        .unwrap();

    let list = db.get_deployments(app_id).await.unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, deploy_id);
    assert_eq!(list[0].status, "pending");

    db.update_deployment_status(deploy_id, "success", Some("Done"))
        .await
        .unwrap();

    let d = db.get_deployment(deploy_id).await.unwrap();
    assert_eq!(d.status, "success");
    assert_eq!(d.logs.as_deref(), Some("Done"));
    assert!(d.finished_at.is_some());
}
