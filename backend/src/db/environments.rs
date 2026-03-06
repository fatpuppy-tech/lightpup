use chrono::Utc;

use crate::{AppResult, Error};

use super::rows::EnvironmentRow;
use super::{Database, Environment};

impl Database {
    pub async fn create_environment(
        &self,
        id: &str,
        project_id: &str,
        name: &str,
        is_production: bool,
    ) -> AppResult<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO environments (id, project_id, name, is_production, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(id)
        .bind(project_id)
        .bind(name)
        .bind(i32::from(is_production))
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(())
    }

    pub async fn get_environments(&self, project_id: &str) -> AppResult<Vec<Environment>> {
        let rows = sqlx::query_as::<_, EnvironmentRow>(
            "SELECT id, project_id, name, is_production, created_at FROM environments WHERE project_id = ?1",
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(rows.into_iter().map(Environment::from).collect())
    }

    pub async fn get_environment(&self, id: &str) -> AppResult<Environment> {
        let row = sqlx::query_as::<_, EnvironmentRow>(
            "SELECT id, project_id, name, is_production, created_at FROM environments WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::from)?
        .ok_or_else(|| Error::NotFound(format!("Environment {} not found", id)))?;
        Ok(Environment::from(row))
    }

    /// Project ID for an application (via its environment). Used for permission checks.
    pub async fn get_project_id_for_application(&self, application_id: &str) -> AppResult<Option<String>> {
        let row = sqlx::query_scalar::<_, Option<String>>(
            "SELECT e.project_id FROM applications a JOIN environments e ON a.environment_id = e.id WHERE a.id = ?1",
        )
        .bind(application_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(row.flatten())
    }
}

