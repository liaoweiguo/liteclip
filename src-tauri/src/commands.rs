//! Tauri Commands：暴露给前端调用的接口
//!
//! 核心是 `build_ffmpeg_args`：把 UI 层的编辑参数（剪切/缩放/编码/音频等）
//! 组装为最终 ffmpeg 命令行参数。前端负责展示 & 二次确认，后端负责执行。

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::ffmpeg::{location_info, run_ffmpeg_with_progress, FfmpegLocation};
use crate::probe::{self, MediaSummary};
use crate::state::TASKS;

// -----------------------------------------------------------------------------
// FFmpeg 状态 / 元信息
// -----------------------------------------------------------------------------

#[derive(Serialize)]
pub struct FfmpegStatus {
    pub ffmpeg: Option<FfmpegLocation>,
    pub ffprobe: Option<FfmpegLocation>,
}

#[tauri::command]
pub async fn ffmpeg_status() -> Result<FfmpegStatus, String> {
    Ok(FfmpegStatus {
        ffmpeg: location_info("ffmpeg"),
        ffprobe: location_info("ffprobe"),
    })
}

#[tauri::command]
pub async fn probe_media(path: String) -> Result<MediaSummary, String> {
    // ffprobe 是短命令，直接阻塞线程池运行
    tauri::async_runtime::spawn_blocking(move || probe::probe(&path))
        .await
        .map_err(|e| format!("任务失败: {e}"))?
}

// -----------------------------------------------------------------------------
// 编辑参数（与前端类型一一对应）
// -----------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TrimSpec {
    pub enabled: bool,
    pub start: Option<f64>, // 秒
    pub end: Option<f64>,   // 秒
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResizeSpec {
    pub enabled: bool,
    pub width: Option<i64>,
    pub height: Option<i64>,
    /// fit | fill | stretch
    pub mode: Option<String>,
    /// 保持宽高比时对齐（居中）
    pub pad_color: Option<String>, // 例如 "black"
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RotateSpec {
    pub enabled: bool,
    /// 顺时针角度：90 / 180 / 270，或 flip-h / flip-v
    pub degrees: Option<i64>,
    pub flip: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SpeedSpec {
    pub enabled: bool,
    /// 倍速：0.25 ~ 4.0
    pub factor: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FpsSpec {
    pub enabled: bool,
    pub fps: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VideoEncodeSpec {
    /// h264 | h265 | av1 | copy | vp9
    pub codec: String,
    /// crf（质量），越小越清晰
    pub crf: Option<i64>,
    /// preset：ultrafast ~ veryslow（x264/x265）
    pub preset: Option<String>,
    /// 目标码率（kbps），设置后覆盖 crf
    pub bitrate_kbps: Option<i64>,
    /// 硬件加速：videotoolbox(mac) / nvenc(win) / qsv / vaapi(linux) / auto
    pub hwaccel: Option<String>,
    pub pix_fmt: Option<String>, // 通常 "yuv420p"
    pub profile: Option<String>, // h264: baseline/main/high
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AudioEncodeSpec {
    /// aac | mp3 | opus | copy | none
    pub codec: String,
    pub bitrate_kbps: Option<i64>,
    pub sample_rate: Option<i64>,
    pub channels: Option<i64>,
    pub volume: Option<f64>, // 1.0 = 原始
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContainerSpec {
    /// mp4 | mov | mkv | webm | gif
    pub format: String,
    /// faststart（仅 mp4/mov 生效）
    pub faststart: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct JobSpec {
    pub input: String,
    pub output: String,
    pub trim: Option<TrimSpec>,
    pub resize: Option<ResizeSpec>,
    pub rotate: Option<RotateSpec>,
    pub speed: Option<SpeedSpec>,
    pub fps: Option<FpsSpec>,
    pub video: Option<VideoEncodeSpec>,
    pub audio: Option<AudioEncodeSpec>,
    pub container: Option<ContainerSpec>,
    /// 覆盖输出：true 时使用 -y
    pub overwrite: Option<bool>,
    /// 高兼容性模式：由前端 preset 触发，这里作为额外保险开关
    pub high_compat: Option<bool>,
    /// 输入时长（用于进度百分比）
    pub input_duration: Option<f64>,
}

// -----------------------------------------------------------------------------
// 参数构建
// -----------------------------------------------------------------------------

/// 构造 ffmpeg 参数向量（不含二进制）。
/// 该函数保持纯逻辑，方便单元测试，也便于前端通过命令预览查看。
pub fn build_args(spec: &JobSpec) -> Vec<String> {
    let mut a: Vec<String> = Vec::new();

    let high_compat = spec.high_compat.unwrap_or(false);

    // 覆盖
    if spec.overwrite.unwrap_or(true) {
        a.push("-y".into());
    }

    // 硬件加速输入（放在 -i 之前）
    if let Some(v) = spec.video.as_ref() {
        if let Some(hw) = v.hwaccel.as_deref() {
            match hw {
                "videotoolbox" => {
                    a.push("-hwaccel".into());
                    a.push("videotoolbox".into());
                }
                "cuda" | "nvenc" => {
                    a.push("-hwaccel".into());
                    a.push("cuda".into());
                }
                "qsv" => {
                    a.push("-hwaccel".into());
                    a.push("qsv".into());
                }
                "vaapi" => {
                    a.push("-hwaccel".into());
                    a.push("vaapi".into());
                }
                _ => {}
            }
        }
    }

    // 剪切（作为输入选项，放在 -i 之前）
    //
    // 关键：裁剪必须发生在变速滤镜 setpts 之前。若把 -ss/-to 放在 -i 之后
    // （输出选项），它们作用的是「滤镜链之后」的输出时间轴；当 speed>1 时
    // setpts=PTS/f 会压缩时间戳，导致 -to 反推出的输入终点被等比拉长
    // （例如 -to 96.880 + 1.25x 实际会读到输入 121.1s）。
    // 改为输入侧 -ss + -t（时长）后，FFmpeg 先裁剪原始片段再交给滤镜加速，
    // 输出时长 = (end-start)/factor，符合预期。
    if let Some(t) = spec.trim.as_ref() {
        if t.enabled {
            let start = t.start.unwrap_or(0.0).max(0.0);
            if start > 0.0 {
                a.push("-ss".into());
                a.push(format!("{:.3}", start));
            }
            if let Some(e) = t.end {
                if e > start {
                    a.push("-t".into());
                    a.push(format!("{:.3}", e - start));
                }
            }
        }
    }

    // 输入
    a.push("-i".into());
    a.push(spec.input.clone());

    // ------- 视频滤镜链 -------
    let mut filters: Vec<String> = Vec::new();

    if let Some(r) = spec.resize.as_ref() {
        if r.enabled {
            let w = r.width.unwrap_or(-2);
            let h = r.height.unwrap_or(-2);
            let mode = r.mode.clone().unwrap_or_else(|| "fit".into());
            let pad_color = r.pad_color.clone().unwrap_or_else(|| "black".into());
            match mode.as_str() {
                // 缩放后加黑边保持比例
                "fit" => {
                    filters.push(format!(
                        "scale=w={w}:h={h}:force_original_aspect_ratio=decrease"
                    ));
                    filters.push(format!(
                        "pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color={pad_color}"
                    ));
                }
                // 缩放后裁剪填满
                "fill" => {
                    filters.push(format!(
                        "scale=w={w}:h={h}:force_original_aspect_ratio=increase"
                    ));
                    filters.push(format!("crop={w}:{h}"));
                }
                // 拉伸变形
                "stretch" => {
                    filters.push(format!("scale={w}:{h}"));
                }
                _ => {}
            }
            // 保证宽高为偶数（H.264/HEVC 要求）
            filters.push("scale=trunc(iw/2)*2:trunc(ih/2)*2".into());
        }
    }

    if let Some(rt) = spec.rotate.as_ref() {
        if rt.enabled {
            match rt.degrees {
                Some(90) => filters.push("transpose=1".into()),
                Some(180) => filters.push("transpose=1,transpose=1".into()),
                Some(270) => filters.push("transpose=2".into()),
                _ => {}
            }
            match rt.flip.as_deref() {
                Some("h") => filters.push("hflip".into()),
                Some("v") => filters.push("vflip".into()),
                _ => {}
            }
        }
    }

    if let Some(sp) = spec.speed.as_ref() {
        if sp.enabled {
            if let Some(f) = sp.factor {
                if f > 0.0 && (f - 1.0).abs() > 1e-3 {
                    // setpts 视频，atempo 音频（音频稍后单独处理）
                    filters.push(format!("setpts=PTS/{:.4}", f));
                }
            }
        }
    }

    if let Some(f) = spec.fps.as_ref() {
        if f.enabled {
            if let Some(v) = f.fps {
                if v > 0.0 {
                    filters.push(format!("fps={}", v));
                }
            }
        }
    }

    if !filters.is_empty() {
        a.push("-vf".into());
        a.push(filters.join(","));
    }

    // ------- 视频编码 -------
    let v = spec.video.clone().unwrap_or_default();
    let codec = if high_compat {
        "h264".to_string()
    } else {
        v.codec.clone()
    };

    match codec.as_str() {
        "copy" => {
            a.push("-c:v".into());
            a.push("copy".into());
        }
        "h264" => {
            let enc = pick_h264_encoder(v.hwaccel.as_deref());
            a.push("-c:v".into());
            a.push(enc.clone());
            push_h264_quality(&mut a, &enc, &v, high_compat);
            a.push("-pix_fmt".into());
            a.push(v.pix_fmt.clone().unwrap_or_else(|| "yuv420p".into()));
            if high_compat {
                a.push("-profile:v".into());
                a.push("high".into());
                a.push("-level".into());
                a.push("4.0".into());
            } else if let Some(p) = v.profile.as_deref() {
                if !p.is_empty() {
                    a.push("-profile:v".into());
                    a.push(p.into());
                }
            }
        }
        "h265" | "hevc" => {
            let enc = pick_hevc_encoder(v.hwaccel.as_deref());
            a.push("-c:v".into());
            a.push(enc.clone());
            if let Some(br) = v.bitrate_kbps {
                if br > 0 {
                    a.push("-b:v".into());
                    a.push(format!("{br}k"));
                }
            } else if let Some(crf) = v.crf {
                if enc == "libx265" {
                    a.push("-crf".into());
                } else {
                    a.push("-q:v".into());
                }
                a.push(crf.to_string());
            }
            if let Some(p) = v.preset.as_deref() {
                if !p.is_empty() && enc.starts_with("libx265") {
                    a.push("-preset".into());
                    a.push(p.into());
                }
            }
            a.push("-pix_fmt".into());
            a.push(v.pix_fmt.clone().unwrap_or_else(|| "yuv420p".into()));
            a.push("-tag:v".into());
            a.push("hvc1".into()); // Apple / QuickTime 兼容
        }
        "av1" => {
            a.push("-c:v".into());
            a.push("libsvtav1".into());
            if let Some(crf) = v.crf {
                a.push("-crf".into());
                a.push(crf.to_string());
            }
            // libsvtav1 的 -preset 接受 0~13 的整数（数值越大越快），
            // 不能直接接受 x264 风格的 "medium"/"slow" 字符串，故映射。
            if let Some(p) = v.preset.as_deref() {
                if let Some(n) = map_x264_preset_to_svtav1(p) {
                    a.push("-preset".into());
                    a.push(n.to_string());
                }
            }
        }
        "vp9" => {
            a.push("-c:v".into());
            a.push("libvpx-vp9".into());
            if let Some(br) = v.bitrate_kbps {
                a.push("-b:v".into());
                a.push(format!("{br}k"));
            } else {
                a.push("-b:v".into());
                a.push("0".into());
                if let Some(crf) = v.crf {
                    a.push("-crf".into());
                    a.push(crf.to_string());
                }
            }
        }
        _ => {}
    }

    // ------- 音频编码 -------
    let au = spec.audio.clone().unwrap_or_default();
    let acodec = if high_compat {
        "aac".to_string()
    } else {
        au.codec.clone()
    };
    match acodec.as_str() {
        "none" => {
            a.push("-an".into());
        }
        "copy" => {
            a.push("-c:a".into());
            a.push("copy".into());
        }
        "aac" => {
            a.push("-c:a".into());
            a.push("aac".into());
            a.push("-b:a".into());
            a.push(format!(
                "{}k",
                au.bitrate_kbps.unwrap_or(if high_compat { 192 } else { 160 })
            ));
            if let Some(sr) = au.sample_rate {
                a.push("-ar".into());
                a.push(sr.to_string());
            } else if high_compat {
                a.push("-ar".into());
                a.push("48000".into());
            }
            if let Some(ch) = au.channels {
                a.push("-ac".into());
                a.push(ch.to_string());
            } else if high_compat {
                a.push("-ac".into());
                a.push("2".into());
            }
        }
        "mp3" => {
            a.push("-c:a".into());
            a.push("libmp3lame".into());
            a.push("-b:a".into());
            a.push(format!("{}k", au.bitrate_kbps.unwrap_or(192)));
        }
        "opus" => {
            a.push("-c:a".into());
            a.push("libopus".into());
            a.push("-b:a".into());
            a.push(format!("{}k", au.bitrate_kbps.unwrap_or(128)));
        }
        _ => {}
    }

    // 音频变速（atempo 单次范围 0.5~2.0，需级联）
    if let Some(sp) = spec.speed.as_ref() {
        if sp.enabled {
            if let Some(f) = sp.factor {
                if f > 0.0 && (f - 1.0).abs() > 1e-3 && acodec != "copy" && acodec != "none" {
                    let mut chain: Vec<String> = Vec::new();
                    let mut remain = f;
                    while remain > 2.0 {
                        chain.push("atempo=2.0".into());
                        remain /= 2.0;
                    }
                    while remain < 0.5 {
                        chain.push("atempo=0.5".into());
                        remain /= 0.5;
                    }
                    chain.push(format!("atempo={:.4}", remain));
                    a.push("-af".into());
                    a.push(chain.join(","));
                }
            }
        }
    }

    // 音量
    if let Some(vol) = au.volume {
        if (vol - 1.0).abs() > 1e-3 && vol > 0.0 && acodec != "copy" && acodec != "none" {
            // 与 atempo 合并到 -af
            let existing = a
                .iter()
                .position(|x| x == "-af")
                .and_then(|i| a.get(i + 1).cloned());
            let vol_filter = format!("volume={:.3}", vol);
            if let Some(e) = existing {
                if let Some(pos) = a.iter().position(|x| x == "-af") {
                    a[pos + 1] = format!("{e},{vol_filter}");
                }
            } else {
                a.push("-af".into());
                a.push(vol_filter);
            }
        }
    }

    // ------- 容器 & 兼容性 -------
    let c = spec.container.clone().unwrap_or_default();
    let format = if high_compat {
        "mp4".to_string()
    } else {
        c.format.clone()
    };
    match format.as_str() {
        "mp4" | "mov" => {
            if c.faststart || high_compat {
                a.push("-movflags".into());
                a.push("+faststart".into());
            }
        }
        "gif" => {
            // gif 已在滤镜链处理；此处仅设置循环
            a.push("-loop".into());
            a.push("0".into());
        }
        _ => {}
    }

    a.push(spec.output.clone());
    a
}

fn pick_h264_encoder(hwaccel: Option<&str>) -> String {
    match hwaccel.unwrap_or("") {
        "videotoolbox" => "h264_videotoolbox".into(),
        "nvenc" | "cuda" => "h264_nvenc".into(),
        "qsv" => "h264_qsv".into(),
        "vaapi" => "h264_vaapi".into(),
        _ => "libx264".into(),
    }
}

/// 将 x264/x265 风格的 preset 字符串映射为 SVT-AV1 的 0~13 整数（越大越快）。
/// 已经是纯数字的输入直接返回。无法识别的字符串返回 None，则不传递 -preset。
fn map_x264_preset_to_svtav1(p: &str) -> Option<u8> {
    let s = p.trim();
    if s.is_empty() {
        return None;
    }
    if let Ok(n) = s.parse::<u8>() {
        return if n <= 13 { Some(n) } else { Some(13) };
    }
    Some(match s {
        "ultrafast" => 12,
        "superfast" => 11,
        "veryfast" => 10,
        "faster" => 9,
        "fast" => 8,
        "medium" => 6,
        "slow" => 5,
        "slower" => 4,
        "veryslow" => 2,
        "placebo" => 1,
        _ => return None,
    })
}

fn pick_hevc_encoder(hwaccel: Option<&str>) -> String {
    match hwaccel.unwrap_or("") {
        "videotoolbox" => "hevc_videotoolbox".into(),
        "nvenc" | "cuda" => "hevc_nvenc".into(),
        "qsv" => "hevc_qsv".into(),
        "vaapi" => "hevc_vaapi".into(),
        _ => "libx265".into(),
    }
}

fn push_h264_quality(a: &mut Vec<String>, enc: &str, v: &VideoEncodeSpec, high_compat: bool) {
    // 优先目标码率；否则 CRF
    if let Some(br) = v.bitrate_kbps {
        if br > 0 {
            a.push("-b:v".into());
            a.push(format!("{br}k"));
            a.push("-maxrate".into());
            a.push(format!("{}k", (br as f64 * 1.45) as i64));
            a.push("-bufsize".into());
            a.push(format!("{}k", br * 2));
            return;
        }
    }
    let crf = v.crf.unwrap_or(if high_compat { 23 } else { 22 });
    match enc {
        "libx264" => {
            a.push("-crf".into());
            a.push(crf.to_string());
        }
        "h264_videotoolbox" => {
            // videotoolbox 使用 -q:v 或 -b:v，此处用 -q:v（1~100，越大越好）
            a.push("-q:v".into());
            let q = (60 - crf).clamp(20, 60);
            a.push(q.to_string());
        }
        "h264_nvenc" => {
            a.push("-cq".into());
            a.push(crf.to_string());
        }
        _ => {
            a.push("-crf".into());
            a.push(crf.to_string());
        }
    }
    if let Some(p) = v.preset.as_deref() {
        if !p.is_empty() && (enc == "libx264" || enc == "h264_nvenc") {
            a.push("-preset".into());
            a.push(p.into());
        }
    }
}

#[tauri::command]
pub async fn build_ffmpeg_args(spec: JobSpec) -> Result<Vec<String>, String> {
    Ok(build_args(&spec))
}

// -----------------------------------------------------------------------------
// 任务执行 & 取消
// -----------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunReq {
    pub task_id: String,
    pub spec: JobSpec,
}

#[tauri::command]
pub async fn run_ffmpeg(
    app: AppHandle,
    req: RunReq,
) -> Result<i32, String> {
    let args = build_args(&req.spec);
    let dur = req.spec.input_duration.unwrap_or(0.0);
    let dur = if dur > 0.0 { Some(dur) } else { None };
    run_ffmpeg_with_progress(app, req.task_id, args, dur).await
}

/// 直接执行用户提供的原始参数列表（自定义命令模式）。
/// 安全提示：args 仅传递给 sidecar ffmpeg/ffprobe，不经过 shell 解析，
/// 因此不存在 shell 注入风险；但仍可能覆盖任意本地文件，需前端确认。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRawReq {
    pub task_id: String,
    pub args: Vec<String>,
    pub duration_hint: Option<f64>,
}

#[tauri::command]
pub async fn run_ffmpeg_raw(
    app: AppHandle,
    req: RunRawReq,
) -> Result<i32, String> {
    run_ffmpeg_with_progress(app, req.task_id, req.args, req.duration_hint).await
}

#[tauri::command]
pub async fn cancel_task(task_id: String) -> Result<bool, String> {
    let map = TASKS.lock().await;
    if let Some(pid_opt) = map.get(&task_id) {
        if let Some(pid) = pid_opt {
            // 使用系统 kill
            #[cfg(unix)]
            {
                let _ = std::process::Command::new("kill")
                    .arg("-TERM")
                    .arg(pid.to_string())
                    .status();
            }
            #[cfg(windows)]
            {
                let _ = std::process::Command::new("taskkill")
                    .args(["/PID", &pid.to_string(), "/T", "/F"])
                    .status();
            }
            return Ok(true);
        }
    }
    Ok(false)
}

// -----------------------------------------------------------------------------
// 文件选择 / 打开目录（便捷命令）
// -----------------------------------------------------------------------------

#[tauri::command]
pub async fn pick_input(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .add_filter(
            "Media",
            &[
                "mp4", "mov", "mkv", "avi", "webm", "flv", "wmv", "m4v", "mp3", "wav", "m4a",
                "aac", "flac", "ogg", "opus", "gif",
            ],
        )
        .pick_file(move |f| {
            let _ = tx.send(f.map(|p| p.to_string()));
        });
    rx.recv().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pick_output(
    app: AppHandle,
    default_name: Option<String>,
    default_dir: Option<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    let mut b = app.dialog().file();
    if let Some(n) = default_name {
        b = b.set_file_name(n);
    }
    if let Some(d) = default_dir {
        if !d.is_empty() {
            if let Ok(p) = std::path::PathBuf::from(d).canonicalize() {
                b = b.set_directory(p);
            }
        }
    }
    b.save_file(move |f| {
        let _ = tx.send(f.map(|p| p.to_string()));
    });
    rx.recv().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reveal_in_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .status();
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer")
            .args(["/select,", &path])
            .status();
    }
    #[cfg(target_os = "linux")]
    {
        let parent = std::path::Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(path.clone());
        let _ = std::process::Command::new("xdg-open").arg(parent).status();
    }
    Ok(())
}
