//! LiteClip - Tauri 应用入口 & FFmpeg Sidecar 桥接层
//!
//! 设计要点：
//! 1. 优先使用 Tauri Sidecar（打包内置的 ffmpeg / ffprobe）；
//! 2. 若 Sidecar 不存在，则回退到系统 PATH 中的 ffmpeg / ffprobe（便于开发调试）；
//! 3. 所有耗时任务通过异步 tokio 进程执行，实时通过 Tauri event 推送进度到前端；
//! 4. 支持任务取消：以 task_id 为键在 TASKS 中保存子进程 handle。

pub mod commands;
pub mod ffmpeg;
pub mod probe;
pub mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::ffmpeg_status,
            commands::probe_media,
            commands::run_ffmpeg,
            commands::run_ffmpeg_raw,
            commands::cancel_task,
            commands::build_ffmpeg_args,
            commands::pick_input,
            commands::pick_output,
            commands::reveal_in_folder,
        ])
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                // 开发期打印 ffmpeg 位置，便于排查
                if let Ok(p) = ffmpeg::resolve_binary("ffmpeg") {
                    println!("[liteclip] using ffmpeg: {}", p.display());
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running LiteClip");
}
