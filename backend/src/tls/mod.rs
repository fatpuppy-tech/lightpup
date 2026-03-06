use std::path::PathBuf;
use std::sync::Arc;

use chrono::Utc;
use rustls::pki_types::CertificateDer;
use tokio::sync::RwLock;

use crate::{AppResult, Error};

#[derive(Clone)]
pub struct TlsManager {
    data_dir: PathBuf,
    cache: Arc<RwLock<TlsCache>>,
}

#[derive(Default)]
struct TlsCache;

impl TlsManager {
    pub fn new(data_dir: PathBuf) -> Self {
        let cert_dir = data_dir.join("certs");
        std::fs::create_dir_all(&cert_dir).ok();
        
        Self {
            data_dir: cert_dir,
            cache: Arc::new(RwLock::new(TlsCache)),
        }
    }

    pub fn cert_dir(&self) -> &PathBuf {
        &self.data_dir
    }

    pub fn http_challenge_path(&self) -> PathBuf {
        self.data_dir.join(".well-known").join("acme-challenge")
    }

    fn domain_dir(&self, domain: &str) -> PathBuf {
        self.data_dir.join(domain)
    }

    pub async fn has_certificate(&self, domain: &str) -> bool {
        self.domain_dir(domain).join("cert.pem").exists() 
            && self.domain_dir(domain).join("key.pem").exists()
    }

    pub async fn provision_certificate(
        &self,
        domain: &str,
        email: Option<&str>,
    ) -> AppResult<CertificateInfo> {
        tracing::info!("Provisioning certificate for domain: {}", domain);

        std::fs::create_dir_all(self.domain_dir(domain))?;

        let email = email.unwrap_or("admin@example.com");
        
        let (private_key_pem, csr_der) = generate_csr_and_key(domain)?;
        
        let directory = get_lets_encrypt_directory().await?;
        
        let account_url = register_account(&directory, email).await?;
        
        let order_url = create_order(&directory, &account_url, domain).await?;
        
        let (auth_url, challenge) = poll_for_authorization(&order_url).await?;
        
        self.store_http_challenge(&challenge.token, &challenge.key_authorization).await?;
        
        trigger_challenge_validation(&challenge.url).await?;
        
        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
        
        check_challenge_status(&auth_url).await?;
        
        let cert_url = finalize_order(&directory, &order_url, &account_url, &csr_der).await?;
        
        let cert_pem = download_certificate(&cert_url).await?;
        
        let fullchain = cert_pem.clone();
        
        std::fs::write(self.domain_dir(domain).join("fullchain.pem"), &fullchain)?;
        std::fs::write(self.domain_dir(domain).join("cert.pem"), &fullchain)?;
        std::fs::write(self.domain_dir(domain).join("key.pem"), &private_key_pem)?;
        
        self.clear_http_challenge(&challenge.token).await;

        let info = CertificateInfo {
            domain: domain.to_string(),
            expires_at: Some(extract_expiry(&fullchain)),
            is_ssl: true,
        };

        tracing::info!("Certificate provisioned successfully for {}", domain);

        Ok(info)
    }

    pub async fn upload_certificate(
        &self,
        domain: &str,
        cert_pem: &str,
        key_pem: &str,
    ) -> AppResult<CertificateInfo> {
        tracing::info!("Uploading certificate for domain: {}", domain);

        std::fs::create_dir_all(self.domain_dir(domain))?;
        
        std::fs::write(self.domain_dir(domain).join("cert.pem"), cert_pem)?;
        std::fs::write(self.domain_dir(domain).join("key.pem"), key_pem)?;
        
        let fullchain = cert_pem.to_string();
        std::fs::write(self.domain_dir(domain).join("fullchain.pem"), &fullchain)?;

        let info = CertificateInfo {
            domain: domain.to_string(),
            expires_at: Some(extract_expiry(&fullchain)),
            is_ssl: true,
        };

        tracing::info!("Certificate uploaded successfully for {}", domain);

        Ok(info)
    }

    async fn store_http_challenge(&self, token: &str, key_auth: &str) -> AppResult<()> {
        let challenge_dir = self.data_dir.join(".well-known").join("acme-challenge");
        std::fs::create_dir_all(&challenge_dir)?;
        std::fs::write(challenge_dir.join(token), key_auth)?;
        Ok(())
    }

    async fn clear_http_challenge(&self, token: &str) {
        let challenge_path = self.data_dir.join(".well-known").join("acme-challenge").join(token);
        std::fs::remove_file(challenge_path).ok();
    }

    pub async fn delete_certificate(&self, domain: &str) -> AppResult<()> {
        let dir = self.domain_dir(domain);
        if dir.exists() {
            std::fs::remove_dir_all(dir)?;
        }
        
        Ok(())
    }
}

fn generate_csr_and_key(domain: &str) -> AppResult<(String, Vec<u8>)> {
    use rsa::pkcs8::{EncodePrivateKey, LineEnding};
    
    let mut rng = rand::thread_rng();
    let bits = 2048;
    let key = rsa::RsaPrivateKey::new(&mut rng, bits)
        .map_err(|e| Error::Internal(format!("Failed to generate RSA key: {}", e)))?;

    let private_key_pem = key
        .to_pkcs8_pem(LineEnding::CRLF)
        .map_err(|e| Error::Internal(format!("Failed to encode private key: {}", e)))?
        .to_string();

    let key_pair = rcgen::KeyPair::from_pem(&private_key_pem)
        .map_err(|e| Error::Internal(format!("Failed to create key pair: {}", e)))?;

    let mut distinguished_name = rcgen::DistinguishedName::new();
    distinguished_name.push(rcgen::DnType::CommonName, domain);
    
    let mut params = rcgen::CertificateParams::default();
    params.distinguished_name = distinguished_name;
    
    let cert = params.self_signed(&key_pair)
        .map_err(|e| Error::Internal(format!("Failed to create self-signed cert: {}", e)))?;
    
    let csr_der = cert.der();
    
    Ok((private_key_pem, csr_der.to_vec()))
}

#[derive(serde::Deserialize)]
struct LeDirectory {
    newNonce: String,
    newAccount: String,
    newOrder: String,
    revokeCert: String,
}

async fn get_lets_encrypt_directory() -> AppResult<LeDirectory> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://acme-v02.api.letsencrypt.org/directory")
        .send()
        .await
        .map_err(|e| Error::Internal(format!("Failed to get directory: {}", e)))?;
    
    resp.json::<LeDirectory>()
        .await
        .map_err(|e| Error::Internal(format!("Failed to parse directory: {}", e)))
}

#[derive(serde::Deserialize)]
struct LeAccount {
    id: String,
}

async fn register_account(directory: &LeDirectory, email: &str) -> AppResult<String> {
    let client = reqwest::Client::new();
    
    let payload = serde_json::json!({
        "termsOfServiceAgreed": true,
        "contact": [format!("mailto:{}", email)]
    });
    
    let resp = client
        .post(&directory.newAccount)
        .header("Content-Type", "application/jose+json")
        .json(&new_jose_header())
        .body(serialize_jws_payload(&payload))
        .send()
        .await
        .map_err(|e| Error::Internal(format!("Failed to register account: {}", e)))?;
    
    let location = resp.headers().get("location")
        .cloned()
        .map(|h| h.to_str().unwrap().to_string());
    
    let account: LeAccount = resp.json().await.map_err(|e| Error::Internal(format!("Failed to parse account: {}", e)))?;
    
    Ok(location.unwrap_or(account.id))
}

fn new_jose_header() -> serde_json::Value {
    serde_json::json!({
        "alg": "RS256",
        "jwk": {
            "kty": "RSA",
            "n": "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw",
            "e": "AQAB"
        }
    })
}

fn serialize_jws_payload(payload: &serde_json::Value) -> String {
    use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
    
    let protected = BASE64.encode(serde_json::to_string(&new_jose_header()).unwrap());
    let payload_b64 = BASE64.encode(payload.to_string());
    format!("{{\"protected\":\"{}\",\"payload\":\"{}\",\"signature\":\"\"}}", protected, payload_b64)
}

async fn create_order(directory: &LeDirectory, account_url: &str, domain: &str) -> AppResult<String> {
    let client = reqwest::Client::new();
    
    let payload = serde_json::json!({
        "identifiers": [{"type": "dns", "value": domain}]
    });
    
    let resp = client
        .post(&directory.newOrder)
        .header("Content-Type", "application/jose+json")
        .header("Location", account_url)
        .json(&new_jose_header())
        .body(serialize_jws_payload(&payload))
        .send()
        .await
        .map_err(|e| Error::Internal(format!("Failed to create order: {}", e)))?;
    
    let location = resp.headers().get("location")
        .cloned()
        .ok_or_else(|| Error::Internal("No location header".to_string()))?;
    
    Ok(location.to_str().unwrap().to_string())
}

#[derive(serde::Deserialize)]
struct LeOrder {
    authorizations: Vec<String>,
    finalize: String,
}

#[derive(serde::Deserialize)]
struct LeAuthorization {
    challenges: Vec<LeChallenge>,
}

#[derive(serde::Deserialize, Clone)]
struct LeChallenge {
    #[serde(rename = "type")]
    challenge_type: String,
    token: String,
    url: String,
    #[serde(rename = "keyAuthorization")]
    key_authorization: String,
}

async fn poll_for_authorization(order_url: &str) -> AppResult<(String, LeChallenge)> {
    let client = reqwest::Client::new();
    
    for _ in 0..10 {
        let resp = client
            .get(order_url)
            .header("Content-Type", "application/jose+json")
            .send()
            .await
            .map_err(|e| Error::Internal(format!("Failed to poll order: {}", e)))?;
        
        let order: LeOrder = resp.json().await.map_err(|e| Error::Internal(format!("Failed to parse order: {}", e)))?;
        
        if !order.authorizations.is_empty() {
            let auth_url = &order.authorizations[0];
            
            let resp = client
                .get(auth_url)
                .send()
                .await
                .map_err(|e| Error::Internal(format!("Failed to get authorization: {}", e)))?;
            
            let authz: LeAuthorization = resp.json().await.map_err(|e| Error::Internal(format!("Failed to parse authorization: {}", e)))?;
            
            if let Some(challenge) = authz.challenges.into_iter().find(|c| c.challenge_type == "http-01") {
                return Ok((auth_url.clone(), challenge));
            }
        }
        
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }
    
    Err(Error::Internal("Authorization timeout".to_string()))
}

async fn trigger_challenge_validation(challenge_url: &str) -> AppResult<()> {
    let client = reqwest::Client::new();
    
    client
        .post(challenge_url)
        .header("Content-Type", "application/jose+json")
        .json(&new_jose_header())
        .body("{}")
        .send()
        .await
        .map_err(|e| Error::Internal(format!("Failed to trigger challenge: {}", e)))?;
    
    Ok(())
}

async fn check_challenge_status(auth_url: &str) -> AppResult<()> {
    let client = reqwest::Client::new();
    
    for _ in 0..10 {
        let resp = client
            .get(auth_url)
            .send()
            .await
            .map_err(|e| Error::Internal(format!("Failed to check challenge: {}", e)))?;
        
        let authz: LeAuthorization = resp.json().await.map_err(|e| Error::Internal(format!("Failed to parse: {}", e)))?;
        
        if let Some(challenge) = authz.challenges.iter().find(|c| c.challenge_type == "http-01") {
            if !challenge.key_authorization.is_empty() {
                return Ok(());
            }
        }
        
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }
    
    Err(Error::Internal("Challenge validation timeout".to_string()))
}

async fn finalize_order(directory: &LeDirectory, order_url: &str, account_url: &str, csr_der: &[u8]) -> AppResult<String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
    
    let client = reqwest::Client::new();
    
    let payload = serde_json::json!({
        "csr": BASE64.encode(csr_der)
    });
    
    let resp = client
        .post(order_url)
        .header("Content-Type", "application/jose+json")
        .header("Location", account_url)
        .json(&new_jose_header())
        .body(serialize_jws_payload(&payload))
        .send()
        .await
        .map_err(|e| Error::Internal(format!("Failed to finalize order: {}", e)))?;
    
    let location = resp.headers().get("location")
        .cloned()
        .ok_or_else(|| Error::Internal("No location header".to_string()))?;
    
    Ok(location.to_str().unwrap().to_string())
}

#[derive(serde::Deserialize)]
struct LeCertificate {
    certificate: String,
}

async fn download_certificate(cert_url: &str) -> AppResult<String> {
    let client = reqwest::Client::new();
    
    let resp = client
        .get(cert_url)
        .send()
        .await
        .map_err(|e| Error::Internal(format!("Failed to download certificate: {}", e)))?;
    
    let cert: LeCertificate = resp.json().await.map_err(|e| Error::Internal(format!("Failed to parse certificate: {}", e)))?;
    
    Ok(cert.certificate)
}

fn extract_expiry(cert_data: &str) -> String {
    if let Ok(certs) = load_certs(cert_data.as_bytes()) {
        if let Some(cert) = certs.first() {
            if let Ok(parsed) = x509_parser::parse_x509_certificate(cert.as_ref()) {
                let not_after = parsed.1.validity().not_after;
                if let Ok(s) = not_after.to_rfc2822() {
                    return s;
                }
            }
        }
    }
    Utc::now().to_rfc3339()
}

fn load_certs(data: &[u8]) -> AppResult<Vec<CertificateDer<'static>>> {
    let mut cursor = std::io::Cursor::new(data);
    let mut certs = Vec::new();
    
    loop {
        match rustls_pemfile::read_one(&mut cursor) {
            Ok(Some(rustls_pemfile::Item::X509Certificate(cert))) => certs.push(cert),
            Ok(None) => break,
            Err(e) => return Err(Error::Internal(format!("Failed to read cert: {}", e))),
            _ => continue,
        }
    }
    
    if certs.is_empty() {
        return Err(Error::InvalidInput("No certificates found".to_string()));
    }
    
    Ok(certs)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CertificateInfo {
    pub domain: String,
    pub expires_at: Option<String>,
    pub is_ssl: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProvisionRequest {
    pub domain: String,
    pub email: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct UploadCertificateRequest {
    pub domain: String,
    pub cert_pem: String,
    pub key_pem: String,
}
