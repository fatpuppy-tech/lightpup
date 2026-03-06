use crate::{AppResult, Error};

use super::Database;

#[derive(Clone, Debug)]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

impl Database {
    pub async fn list_project_env(&self, project_id: &str) -> AppResult<Vec<EnvVar>> {
        let rows = sqlx::query_as::<_, (String, String)>(
            "SELECT key, value FROM project_env WHERE project_id = ?1 ORDER BY key",
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(rows
            .into_iter()
            .map(|(key, value)| EnvVar { key, value })
            .collect())
    }

    pub async fn set_project_env(&self, project_id: &str, key: &str, value: &str) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO project_env (project_id, key, value) VALUES (?1, ?2, ?3) \
             ON CONFLICT(project_id, key) DO UPDATE SET value = excluded.value",
        )
        .bind(project_id)
        .bind(key)
        .bind(value)
        .execute(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(())
    }

    pub async fn delete_project_env(&self, project_id: &str, key: &str) -> AppResult<()> {
        let r = sqlx::query("DELETE FROM project_env WHERE project_id = ?1 AND key = ?2")
            .bind(project_id)
            .bind(key)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        if r.rows_affected() == 0 {
            return Err(Error::NotFound(format!("project env key {}", key)));
        }
        Ok(())
    }

    pub async fn list_application_env(&self, application_id: &str) -> AppResult<Vec<EnvVar>> {
        let rows = sqlx::query_as::<_, (String, String)>(
            "SELECT key, value FROM application_env WHERE application_id = ?1 ORDER BY key",
        )
        .bind(application_id)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(rows
            .into_iter()
            .map(|(key, value)| EnvVar { key, value })
            .collect())
    }

    pub async fn set_application_env(
        &self,
        application_id: &str,
        key: &str,
        value: &str,
    ) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO application_env (application_id, key, value) VALUES (?1, ?2, ?3) \
             ON CONFLICT(application_id, key) DO UPDATE SET value = excluded.value",
        )
        .bind(application_id)
        .bind(key)
        .bind(value)
        .execute(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(())
    }

    pub async fn delete_application_env(&self, application_id: &str, key: &str) -> AppResult<()> {
        let r = sqlx::query("DELETE FROM application_env WHERE application_id = ?1 AND key = ?2")
            .bind(application_id)
            .bind(key)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        if r.rows_affected() == 0 {
            return Err(Error::NotFound(format!("application env key {}", key)));
        }
        Ok(())
    }

    /// Collect all env vars for a deployment: project env first, then application env (app overrides).
    pub async fn get_deploy_env(&self, application_id: &str) -> AppResult<Vec<String>> {
        let project_id = match self.get_project_id_for_application(application_id).await? {
            Some(p) => p,
            None => return Ok(Vec::new()),
        };
        let project_vars = self.list_project_env(&project_id).await?;
        let app_vars = self.list_application_env(application_id).await?;
        let mut by_key: std::collections::HashMap<String, String> = project_vars
            .into_iter()
            .map(|e| (e.key, e.value))
            .collect();
        for e in app_vars {
            by_key.insert(e.key, e.value);
        }
        Ok(by_key
            .into_iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect())
    }
}
