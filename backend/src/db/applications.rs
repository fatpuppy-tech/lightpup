use chrono::Utc;

use crate::{AppResult, Error};

use super::rows::application_from_row;
use super::{Application, Database, ProxyAppRow};

impl Database {
    pub async fn create_application(
        &self,
        id: &str,
        env_id: &str,
        name: &str,
        domain: Option<&str>,
        image: &str,
        port: u16,
        repo_url: Option<&str>,
        repo_branch: Option<&str>,
        dockerfile_path: Option<&str>,
        build_type: &str,
        node_id: Option<&str>,
    ) -> AppResult<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO applications (id, environment_id, name, domain, image, port, status, created_at, updated_at, repo_url, repo_branch, dockerfile_path, build_type, node_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'stopped', ?7, ?7, ?8, ?9, ?10, ?11, ?12)",
        )
        .bind(id)
        .bind(env_id)
        .bind(name)
        .bind(domain)
        .bind(image)
        .bind(port as i32)
        .bind(&now)
        .bind(repo_url)
        .bind(repo_branch)
        .bind(dockerfile_path)
        .bind(build_type)
        .bind(node_id)
        .execute(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(())
    }

    pub async fn get_applications(&self, env_id: &str) -> AppResult<Vec<Application>> {
        let rows = sqlx::query(
            "SELECT id, environment_id, name, domain, image, port, status, created_at, updated_at, repo_url, repo_branch, dockerfile_path, build_type, node_id FROM applications WHERE environment_id = ?1",
        )
        .bind(env_id)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(rows.into_iter().map(application_from_row).collect())
    }

    pub async fn get_application(&self, id: &str) -> AppResult<Application> {
        let row = sqlx::query(
            "SELECT id, environment_id, name, domain, image, port, status, created_at, updated_at, repo_url, repo_branch, dockerfile_path, build_type, node_id FROM applications WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::from)?
        .ok_or_else(|| Error::NotFound(format!("Application {} not found", id)))?;
        Ok(application_from_row(row))
    }

    pub async fn get_application_by_domain(&self, domain: &str) -> AppResult<Application> {
        let row = sqlx::query(
            "SELECT id, environment_id, name, domain, image, port, status, created_at, updated_at, repo_url, repo_branch, dockerfile_path, build_type, node_id FROM applications WHERE domain = ?1",
        )
        .bind(domain)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::from)?
        .ok_or_else(|| Error::NotFound(format!("Application for domain {} not found", domain)))?;
        Ok(application_from_row(row))
    }

    pub async fn update_application(
        &self,
        id: &str,
        name: Option<&str>,
        image: Option<&str>,
        port: Option<u16>,
        domain: Option<&str>,
        repo_url: Option<&str>,
        repo_branch: Option<&str>,
        dockerfile_path: Option<&str>,
        build_type: Option<&str>,
        node_id: Option<Option<&str>>,
    ) -> AppResult<()> {
        let now = Utc::now().to_rfc3339();
        let update_node_id = i32::from(node_id.is_some());
        let node_id_value = node_id.and_then(|x| x);
        sqlx::query(
            "UPDATE applications SET name = COALESCE(?1, name), image = COALESCE(?2, image), port = COALESCE(?3, port), domain = COALESCE(?4, domain), repo_url = COALESCE(?5, repo_url), repo_branch = COALESCE(?6, repo_branch), dockerfile_path = COALESCE(?7, dockerfile_path), build_type = COALESCE(?8, build_type), node_id = CASE WHEN ?9 THEN ?10 ELSE node_id END, updated_at = ?11 WHERE id = ?12",
        )
        .bind(name)
        .bind(image)
        .bind(port.map(i32::from))
        .bind(domain)
        .bind(repo_url)
        .bind(repo_branch)
        .bind(dockerfile_path)
        .bind(build_type)
        .bind(update_node_id)
        .bind(node_id_value)
        .bind(&now)
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(())
    }

    pub async fn delete_application(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM applications WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok(())
    }

    pub async fn set_application_status(&self, id: &str, status: &str) -> AppResult<()> {
        sqlx::query("UPDATE applications SET status = ?1 WHERE id = ?2")
            .bind(status)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok(())
    }

    /// List applications with env/project names for proxy dashboard.
    pub async fn get_proxy_apps(&self) -> AppResult<Vec<ProxyAppRow>> {
        let rows = sqlx::query_as::<_, ProxyAppRow>(
            "SELECT a.id, a.name, a.domain, a.port, a.status, e.name AS environment_name, p.name AS project_name \
             FROM applications a \
             JOIN environments e ON a.environment_id = e.id \
             JOIN projects p ON e.project_id = p.id \
             ORDER BY a.created_at DESC LIMIT 100",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(rows)
    }

    /// Find application IDs whose repo_url matches the given repo (e.g. owner/name) and optional branch.
    pub async fn find_app_ids_by_repo(&self, repo_full_name: &str, branch: &str) -> AppResult<Vec<String>> {
        let pattern_https = format!("%github.com/{}%", repo_full_name);
        let pattern_ssh = format!("%:{}%", repo_full_name);
        let ids: Vec<String> = sqlx::query_scalar(
            "SELECT id FROM applications WHERE repo_url IS NOT NULL AND (repo_url LIKE ?1 OR repo_url LIKE ?2) AND (repo_branch IS NULL OR repo_branch = ?3)",
        )
        .bind(&pattern_https)
        .bind(&pattern_ssh)
        .bind(branch)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(ids)
    }
}

