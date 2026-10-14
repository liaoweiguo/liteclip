//! 全局应用状态：任务表（task_id -> 子进程 pid）

use once_cell::sync::Lazy;
use tokio::sync::Mutex;

pub static TASKS: Lazy<Mutex<std::collections::HashMap<String, Option<u32>>>> =
    Lazy::new(|| Mutex::new(std::collections::HashMap::new()));

#[derive(Default)]
pub struct AppState;
