use chrono::Utc;

use crate::{AppResult, Error};

use super::rows::NodeRow;
use super::{Database, Node};

impl Database {
    pub async fn create_node(
        &self,
        id: &str,
        name: &str,
        address: &str,
        ssh_user: Option<&str>,
        ssh_key_path: Option<&str>,
        ssh_key_content: Option<&str>,
        is_active: bool,
    ) -> AppResult<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO nodes (id, name, address, ssh_user, ssh_key_path, ssh_key_content, is_active, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .bind(id)
        .bind(name)
        .bind(address)
        .bind(ssh_user)
        .bind(ssh_key_path)
        .bind(ssh_key_content)
        .bind(i32::from(is_active))
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(())
    }

    pub async fn update_node(
        &self,
        id: &str,
        name: Option<&str>,
        address: Option<&str>,
        ssh_user: Option<&str>,
        ssh_key_path: Option<&str>,
        ssh_key_content: Option<&str>,
        is_active: Option<bool>,
    ) -> AppResult<()> {
        sqlx::query(
            "UPDATE nodes SET \
             name = COALESCE(?1, name), \
             address = COALESCE(?2, address), \
             ssh_user = CASE WHEN ?3 IS NULL THEN ssh_user WHEN ?3 = '' THEN NULL ELSE ?3 END, \
             ssh_key_path = CASE WHEN ?4 IS NULL THEN ssh_key_path WHEN ?4 = '' THEN NULL ELSE ?4 END, \
             ssh_key_content = CASE WHEN ?5 IS NULL THEN ssh_key_content WHEN ?5 = '' THEN NULL ELSE ?5 END, \
             is_active = COALESCE(?6, is_active) \
             WHERE id = ?7",
        )
        .bind(name)
        .bind(address)
        .bind(ssh_user)
        .bind(ssh_key_path)
        .bind(ssh_key_content)
        .bind(is_active.map(i32::from))
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(())
    }

    pub async fn delete_node(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM nodes WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok(())
    }

    pub async fn get_nodes(&self) -> AppResult<Vec<Node>> {
        let rows = sqlx::query_as::<_, NodeRow>(
            "SELECT id, name, address, ssh_user, ssh_key_path, ssh_key_content, is_active, created_at FROM nodes ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(rows.into_iter().map(Node::from).collect())
    }

    pub async fn get_node(&self, id: &str) -> AppResult<Node> {
        let row = sqlx::query_as::<_, NodeRow>(
            "SELECT id, name, address, ssh_user, ssh_key_path, ssh_key_content, is_active, created_at FROM nodes WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::from)?
        .ok_or_else(|| Error::NotFound(format!("Node {} not found", id)))?;
        Ok(Node::from(row))
    }
}

