use crate::{AppResult, Error};

use super::Database;

impl Database {
    pub async fn get_setting(&self, key: &str) -> AppResult<Option<String>> {
        let row =
            sqlx::query_scalar::<_, Option<String>>("SELECT value FROM settings WHERE key = ?1")
                .bind(key)
                .fetch_optional(&self.pool)
                .await
                .map_err(Error::from)?;
        Ok(row.flatten())
    }

    pub async fn set_setting(&self, key: &str, value: &str) -> AppResult<()> {
        sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)")
            .bind(key)
            .bind(value)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok(())
    }

    pub async fn delete_setting(&self, key: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM settings WHERE key = ?1")
            .bind(key)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok(())
    }
}

