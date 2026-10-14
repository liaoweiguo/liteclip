//! FFmpeg / FFprobe 二进制定位与执行封装
//!
//! - Sidecar 模式：`src-tauri/binaries/ffmpeg-<target-triple>[.exe]`
//!   由 Tauri 打包时重命名为资源目录下的 `ffmpeg[.exe]`。
//! - Fallback 模式：从系统 PATH 查找（开发调试友好）。

use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::state::TASKS;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FfmpegLocation {
    pub kind: String,          // "sidecar" | "system"
    pub path: String,
    pub version: Option<String>,
}

/// 目标平台三元组（与 Tauri 打包命名约定一致）
fn target_triple() -> &'static str {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "aarch64-apple-darwin"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "x86_64-apple-darwin"
    } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "x86_64-pc-windows-msvc"
    } else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
        "aarch64-pc-windows-msvc"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "x86_64-unknown-linux-gnu"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "aarch64-unknown-linux-gnu"
    } else {
        "unknown"
    }
}

fn exe_suffix() -> &'static str {
    if cfg!(windows) { ".exe" } else { "" }
}

/// 定位 ffmpeg / ffprobe 二进制。
///
/// 查找顺序：
/// 1. Tauri resource_dir 下 `binaries/ffmpeg[-<triple>][.exe]`
/// 2. 可执行文件同目录 `ffmpeg[-<triple>][.exe]`
/// 3. 系统 PATH（which）
pub fn resolve_binary(name: &str) -> Result<PathBuf, String> {
    let triple = target_triple();
    let suffix = exe_suffix();

    let candidates_names = [
        format!("{name}-{triple}{suffix}"),
        format!("{name}{suffix}"),
    ];

    // 1. dev / build 目录：src-tauri/binaries
    if let Ok(dev_dir) = std::env::current_dir() {
        let binaries_dir = dev_dir.join("binaries");
        if binaries_dir.exists() {
            for n in candidates_names.iter() {
                let p = binaries_dir.join(n);
                if p.exists() {
                    return Ok(p);
                }
            }
        }
        // src-tauri 目录本身
        for n in candidates_names.iter() {
            let p = dev_dir.join("src-tauri").join("binaries").join(n);
            if p.exists() {
                return Ok(p);
            }
        }
    }

    // 2. 打包后：可执行文件同目录
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for n in candidates_names.iter() {
                let p = dir.join(n);
                if p.exists() {
                    return Ok(p);
                }
                let p2 = dir.join("binaries").join(n);
                if p2.exists() {
                    return Ok(p2);
                }
            }
        }
    }

    // 3. 系统 PATH
    if let Ok(p) = which::which(name) {
        return Ok(p);
    }

    Err(format!(
        "未找到 {name} 二进制。请将静态版 {name}{suffix} 放到 src-tauri/binaries/{name}-{triple}{suffix}，或安装系统级 {name}。"
    ))
}

pub fn location_info(name: &str) -> Option<FfmpegLocation> {
    let path = resolve_binary(name).ok()?;
    let kind = if path
        .to_string_lossy()
        .contains(&format!("binaries/{}-", name))
        || path
            .to_string_lossy()
            .contains(&format!("binaries\\{}-", name))
        || path.parent().map(|p| p.ends_with("binaries")).unwrap_or(false)
    {
        "sidecar"
    } else {
        "system"
    };

    let version = std::process::Command::new(&path)
        .arg("-version")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.lines().next().map(|l| l.to_string()));

    Some(FfmpegLocation {
        kind: kind.to_string(),
        path: path.to_string_lossy().to_string(),
        version,
    })
}

/// 异步运行 ffmpeg，实时解析 stderr 中的 `time=HH:MM:SS.xx` 计算进度，
/// 通过 Tauri event `ffmpeg://progress` 推送到前端。
///
/// - `task_id`: 前端生成的唯一 ID，用于取消与事件关联
/// - `args`: ffmpeg 参数（不含二进制路径本身）
/// - `duration_hint`: 输入总时长（秒），用于计算百分比进度
pub async fn run_ffmpeg_with_progress(
    app: tauri::AppHandle,
    task_id: String,
    args: Vec<String>,
    duration_hint: Option<f64>,
) -> Result<i32, String> {
    use tauri::Emitter;

    let bin = resolve_binary("ffmpeg")?;

    let mut cmd = Command::new(&bin);
    cmd.arg("-hide_banner")
        .arg("-nostats")
        .arg("-progress")
        .arg("pipe:1")
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let mut child = cmd.spawn().map_err(|e| format!("启动 ffmpeg 失败: {e}"))?;

    // 注册以便取消
    TASKS.lock().await.insert(task_id.clone(), child.id());

    let stdout = child.stdout.take().ok_or("无法读取 ffmpeg stdout")?;
    let stderr = child.stderr.take().ok_or("无法读取 ffmpeg stderr")?;

    // 并发读取 stderr（错误 / 详细信息），stdout 解析 -progress key=value
    let tid = task_id.clone();
    let app_for_stderr = app.clone();
    let stderr_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        let mut buf: Vec<String> = Vec::new();
        while let Ok(Some(line)) = reader.next_line().await {
            // 只保留最后 200 行，避免内存膨胀
            buf.push(line.clone());
            if buf.len() > 200 {
                buf.remove(0);
            }
            let _ = app_for_stderr.emit(
                "ffmpeg://log",
                serde_json::json!({ "task_id": tid, "line": line }),
            );
        }
        buf
    });

    let tid2 = task_id.clone();
    let duration = duration_hint.unwrap_or(0.0);
    let mut reader = BufReader::new(stdout).lines();

    let mut cur_out_time_ms: f64 = 0.0;
    let mut cur_speed: f64 = 0.0;
    let mut cur_fps: f64 = 0.0;
    let mut cur_bitrate_kbps: f64 = 0.0;
    let mut cur_size_kb: f64 = 0.0;

    while let Ok(Some(line)) = reader.next_line().await {
        // -progress key=value 格式
        if let Some(v) = line.strip_prefix("out_time_ms=") {
            // ffmpeg 输出的是微秒
            if let Ok(x) = v.trim().parse::<f64>() {
                cur_out_time_ms = x / 1_000_000.0;
            }
        } else if let Some(v) = line.strip_prefix("out_time_us=") {
            if let Ok(x) = v.trim().parse::<f64>() {
                cur_out_time_ms = x / 1_000_000.0;
            }
        } else if let Some(v) = line.strip_prefix("speed=") {
            let s = v.trim().trim_end_matches('x');
            if let Ok(x) = s.parse::<f64>() {
                cur_speed = x;
            }
        } else if let Some(v) = line.strip_prefix("fps=") {
            if let Ok(x) = v.trim().parse::<f64>() {
                cur_fps = x;
            }
        } else if let Some(v) = line.strip_prefix("bitrate=") {
            let s = v.trim().replace("kbits/s", "").replace("N/A", "0");
            if let Ok(x) = s.trim().parse::<f64>() {
                cur_bitrate_kbps = x;
            }
        } else if let Some(v) = line.strip_prefix("total_size=") {
            if let Ok(x) = v.trim().parse::<f64>() {
                cur_size_kb = x / 1024.0;
            }
        } else if line == "progress=continue" || line == "progress=end" {
            let percent = if duration > 0.0 {
                (cur_out_time_ms / duration * 100.0).clamp(0.0, 100.0)
            } else {
                0.0
            };
            let _ = app.emit(
                "ffmpeg://progress",
                serde_json::json!({
                    "task_id": tid2,
                    "seconds": cur_out_time_ms,
                    "percent": percent,
                    "speed": cur_speed,
                    "fps": cur_fps,
                    "bitrate_kbps": cur_bitrate_kbps,
                    "size_kb": cur_size_kb,
                    "done": line == "progress=end",
                }),
            );
        }
    }

    let status = child.wait().await.map_err(|e| format!("等待 ffmpeg 结束失败: {e}"))?;
    TASKS.lock().await.remove(&task_id);

    let stderr_lines = stderr_task.await.unwrap_or_default();

    let code = status.code().unwrap_or(-1);

    // 发送最终事件
    let _ = app.emit(
        "ffmpeg://done",
        serde_json::json!({
            "task_id": task_id,
            "exit_code": code,
            "success": status.success(),
            "tail": stderr_lines.iter().rev().take(20).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>(),
        }),
    );

    if status.success() {
        Ok(code)
    } else {
        let tail = stderr_lines
            .iter()
            .rev()
            .take(15)
            .cloned()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("\n");
        Err(format!("ffmpeg 退出码 {code}\n{tail}"))
    }
}

/// 同步执行短命令（如 ffprobe -version）
pub fn run_sync(bin: &Path, args: &[String]) -> Result<String, String> {
    let out = std::process::Command::new(bin)
        .args(args)
        .output()
        .map_err(|e| format!("执行失败: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}
