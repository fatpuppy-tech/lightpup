use crate::AppResult;

pub struct Scheduler {
    _phantom: std::marker::PhantomData<()>,
}

impl Scheduler {
    pub fn new() -> Self {
        Self {
            _phantom: std::marker::PhantomData,
        }
    }

    pub async fn schedule_deployment(&self, _app_id: &str, _version: &str) -> AppResult<String> {
        Ok("".to_string())
    }

    pub async fn cancel_deployment(&self, _deployment_id: &str) -> AppResult<()> {
        Ok(())
    }
}
