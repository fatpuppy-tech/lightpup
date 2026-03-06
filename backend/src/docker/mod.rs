use crate::AppResult;
use bollard::container::{Config, CreateContainerOptions, ListContainersOptions, RemoveContainerOptions, StartContainerOptions, StopContainerOptions};
use bollard::image::CreateImageOptions;
use bollard::Docker;
use futures_util::StreamExt;
use std::collections::HashMap;

pub struct DockerManager {
    client: Docker,
}

impl DockerManager {
    pub async fn new() -> AppResult<Self> {
        let client = Docker::connect_with_local_defaults()
            .map_err(|e| crate::Error::Docker(e.to_string()))?;
        
        client.ping().await
            .map_err(|e| crate::Error::Docker(e.to_string()))?;
        
        tracing::info!("Docker connected successfully");
        Ok(Self { client })
    }

    pub async fn list_containers(&self, all: bool) -> AppResult<Vec<Container>> {
        let options = ListContainersOptions::<String> {
            all,
            ..Default::default()
        };
        
        let containers = self.client.list_containers(Some(options)).await
            .map_err(|e| crate::Error::Docker(e.to_string()))?;
        
        Ok(containers.into_iter().map(|c| Container {
            id: c.id.unwrap_or_default(),
            name: c.names.unwrap_or_default().first().cloned().unwrap_or_default().trim_start_matches('/').to_string(),
            status: c.state.unwrap_or_default(),
            image: c.image.unwrap_or_default(),
        }).collect())
    }

    pub async fn start_container(&self, id: &str) -> AppResult<()> {
        self.client.start_container(id, None::<StartContainerOptions<String>>).await
            .map_err(|e| crate::Error::Docker(e.to_string()))?;
        Ok(())
    }

    pub async fn create_and_start_container(
        &self,
        name: &str,
        image: &str,
        host_port: u16,
        container_port: u16,
    ) -> AppResult<String> {
        self.create_and_start_container_with_env(name, image, host_port, container_port, &[]).await
    }

    /// Like create_and_start_container but with env vars (KEY=VALUE strings).
    pub async fn create_and_start_container_with_env(
        &self,
        name: &str,
        image: &str,
        host_port: u16,
        container_port: u16,
        env: &[String],
    ) -> AppResult<String> {
        self.pull_image(image).await?;

        let _ = self.client.remove_container(name, Some(RemoveContainerOptions {
            force: true,
            ..Default::default()
        })).await;

        let container_port_str = format!("{}/tcp", container_port);
        let mut exposed_ports = HashMap::new();
        exposed_ports.insert(container_port_str.clone(), HashMap::new());

        let mut port_bindings = HashMap::new();
        port_bindings.insert(
            container_port_str,
            Some(vec![bollard::service::PortBinding {
                host_ip: Some("0.0.0.0".to_string()),
                host_port: Some(host_port.to_string()),
            }]),
        );

        let container_config = Config {
            image: Some(image.to_string()),
            env: Some(env.to_vec()),
            exposed_ports: Some(exposed_ports),
            host_config: Some(bollard::service::HostConfig {
                port_bindings: Some(port_bindings),
                ..Default::default()
            }),
            ..Default::default()
        };

        let options = CreateContainerOptions {
            name: name.to_string(),
            platform: None,
        };

        let response = self.client.create_container(Some(options), container_config).await
            .map_err(|e| crate::Error::Docker(e.to_string()))?;

        self.client.start_container(&response.id, None::<StartContainerOptions<String>>).await
            .map_err(|e| crate::Error::Docker(e.to_string()))?;

        Ok(response.id)
    }

    pub async fn stop_container(&self, id: &str) -> AppResult<()> {
        self.client.stop_container(id, Some(StopContainerOptions { t: 10 })).await
            .map_err(|e| crate::Error::Docker(e.to_string()))?;
        Ok(())
    }

    pub async fn remove_container(&self, id: &str) -> AppResult<()> {
        self.client.remove_container(id, Some(RemoveContainerOptions {
            force: true,
            ..Default::default()
        })).await
            .map_err(|e| crate::Error::Docker(e.to_string()))?;
        Ok(())
    }

    pub async fn pull_image(&self, image: &str) -> AppResult<()> {
        tracing::info!("Pulling image: {}", image);
        
        let options = CreateImageOptions {
            from_image: image,
            ..Default::default()
        };
        
        let mut stream = self.client.create_image(Some(options), None, None);
        
        while let Some(result) = stream.next().await {
            match result {
                Ok(info) => {
                    if let Some(status) = info.status {
                        tracing::info!("Pull status: {}", status);
                    }
                }
                Err(e) => return Err(crate::Error::Docker(e.to_string())),
            }
        }
        
        Ok(())
    }

    pub async fn deploy(&self, config: &ContainerConfig) -> AppResult<String> {
        self.pull_image(&config.image).await?;

        // Remove existing container with the same name so we can create a new one (redeploy).
        let _ = self
            .client
            .remove_container(&config.name, Some(RemoveContainerOptions {
                force: true,
                ..Default::default()
            }))
            .await;

        let mut port_bindings = HashMap::new();
        let mut exposed_ports = HashMap::new();
        
        for port in &config.ports {
            let container_port = format!("{}/tcp", port.container);
            exposed_ports.insert(container_port.clone(), HashMap::new());
            port_bindings.insert(container_port, Some(vec![
                bollard::service::PortBinding {
                    host_ip: Some("0.0.0.0".to_string()),
                    host_port: Some(port.host.to_string()),
                }
            ]));
        }

        let env: Vec<String> = config.env.iter().map(|e| e.clone()).collect();

        let host_config = bollard::service::HostConfig {
            port_bindings: Some(port_bindings),
            ..Default::default()
        };

        let container_config = Config {
            image: Some(config.image.clone()),
            env: Some(env),
            exposed_ports: Some(exposed_ports),
            host_config: Some(host_config),
            ..Default::default()
        };

        let options = CreateContainerOptions {
            name: config.name.clone(),
            platform: None,
        };

        let response = self.client.create_container(Some(options), container_config).await
            .map_err(|e| crate::Error::Docker(e.to_string()))?;

        self.client.start_container(&response.id, None::<StartContainerOptions<String>>).await
            .map_err(|e| crate::Error::Docker(e.to_string()))?;

        tracing::info!("Container {} started", response.id);
        Ok(response.id)
    }

    pub async fn get_container_status(&self, name: &str) -> AppResult<Option<String>> {
        let mut filters = std::collections::HashMap::new();
        filters.insert("name".to_string(), vec![name.to_string()]);
        
        let options = ListContainersOptions::<String> {
            all: true,
            filters,
            ..Default::default()
        };
        
        let containers = self.client.list_containers(Some(options)).await
            .map_err(|e| crate::Error::Docker(e.to_string()))?;
        
        Ok(containers.first().and_then(|c| c.state.clone()))
    }
}

pub struct Container {
    pub id: String,
    pub name: String,
    pub status: String,
    pub image: String,
}

pub struct ContainerConfig {
    pub image: String,
    pub name: String,
    pub ports: Vec<PortMapping>,
    pub env: Vec<String>,
}

pub struct PortMapping {
    pub host: u16,
    pub container: u16,
}
