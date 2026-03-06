use crate::AppResult;

pub struct NodeManager {
    _phantom: std::marker::PhantomData<()>,
}

impl NodeManager {
    pub fn new() -> Self {
        Self {
            _phantom: std::marker::PhantomData,
        }
    }

    pub async fn add_node(&self, _address: &str, _name: &str) -> AppResult<String> {
        Ok("".to_string())
    }

    pub async fn remove_node(&self, _id: &str) -> AppResult<()> {
        Ok(())
    }

    pub async fn list_nodes(&self) -> AppResult<Vec<Node>> {
        Ok(vec![])
    }

    pub async fn is_leader(&self) -> bool {
        true
    }
}

pub struct Node {
    pub id: String,
    pub name: String,
    pub address: String,
    pub is_active: bool,
}
