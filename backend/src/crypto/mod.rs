use crate::AppResult;

pub struct CertManager {
    _phantom: std::marker::PhantomData<()>,
}

impl CertManager {
    pub fn new() -> Self {
        Self {
            _phantom: std::marker::PhantomData,
        }
    }

    pub async fn request_cert(&self, _domain: &str) -> AppResult<Certificate> {
        Ok(Certificate {
            cert: "".to_string(),
            key: "".to_string(),
        })
    }

    pub async fn renew_cert(&self, _domain: &str) -> AppResult<Certificate> {
        Ok(Certificate {
            cert: "".to_string(),
            key: "".to_string(),
        })
    }
}

pub struct Certificate {
    pub cert: String,
    pub key: String,
}
