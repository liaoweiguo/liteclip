//! ffprobe 封装：解析媒体文件的元信息（时长、分辨率、编码、帧率、码率、旋转等）

use serde::{Deserialize, Serialize};

use crate::ffmpeg::{resolve_binary, run_sync};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamInfo {
    pub index: i64,
    pub codec_type: String,
    pub codec_name: Option<String>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub r_frame_rate: Option<String>,
    pub avg_frame_rate: Option<String>,
    pub pix_fmt: Option<String>,
    pub sample_rate: Option<String>,
    pub channels: Option<i64>,
    pub bit_rate: Option<String>,
    pub duration: Option<String>,
    pub profile: Option<String>,
    pub display_aspect_ratio: Option<String>,
    pub side_data_list: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormatInfo {
    pub filename: Option<String>,
    pub format_name: Option<String>,
    pub duration: Option<String>,
    pub size: Option<String>,
    pub bit_rate: Option<String>,
    pub nb_streams: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProbeRaw {
    pub streams: Option<Vec<StreamInfo>>,
    pub format: Option<FormatInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaSummary {
    pub path: String,
    pub duration: f64,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub rotation: Option<i64>,
    pub fps: Option<f64>,
    pub v_codec: Option<String>,
    pub a_codec: Option<String>,
    pub pix_fmt: Option<String>,
    pub bit_rate_kbps: Option<f64>,
    pub size_mb: Option<f64>,
    pub has_video: bool,
    pub has_audio: bool,
    pub container: Option<String>,
    pub sample_rate: Option<i64>,
    pub channels: Option<i64>,
}

fn parse_fps(s: &str) -> Option<f64> {
    // 形如 "30000/1001" 或 "25/1"
    if let Some((a, b)) = s.split_once('/') {
        let num: f64 = a.trim().parse().ok()?;
        let den: f64 = b.trim().parse().ok()?;
        if den == 0.0 { None } else { Some(num / den) }
    } else {
        s.trim().parse().ok()
    }
}

fn parse_rotation(stream: &StreamInfo) -> Option<i64> {
    let list = stream.side_data_list.as_ref()?;
    for item in list {
        if let Some(r) = item.get("rotation").and_then(|v| v.as_f64()) {
            return Some(r as i64);
        }
        if let Some(r) = item.get("rotation").and_then(|v| v.as_i64()) {
            return Some(r);
        }
    }
    None
}

pub fn probe(path: &str) -> Result<MediaSummary, String> {
    let bin = resolve_binary("ffprobe")?;

    let args: Vec<String> = vec![
        "-v".into(),
        "error".into(),
        "-print_format".into(),
        "json".into(),
        "-show_format".into(),
        "-show_streams".into(),
        path.into(),
    ];

    let out = run_sync(&bin, &args)?;
    let raw: ProbeRaw = serde_json::from_str(&out)
        .map_err(|e| format!("解析 ffprobe 输出失败: {e}\n{out}"))?;

    let streams = raw.streams.unwrap_or_default();
    let video = streams.iter().find(|s| s.codec_type == "video");
    let audio = streams.iter().find(|s| s.codec_type == "audio");

    let duration = raw
        .format
        .as_ref()
        .and_then(|f| f.duration.clone())
        .and_then(|d| d.parse::<f64>().ok())
        .or_else(|| {
            video
                .and_then(|v| v.duration.clone())
                .and_then(|d| d.parse::<f64>().ok())
        })
        .unwrap_or(0.0);

    let bit_rate_kbps = raw
        .format
        .as_ref()
        .and_then(|f| f.bit_rate.clone())
        .and_then(|b| b.parse::<f64>().ok())
        .map(|b| b / 1000.0);

    let size_mb = raw
        .format
        .as_ref()
        .and_then(|f| f.size.clone())
        .and_then(|b| b.parse::<f64>().ok())
        .map(|b| b / (1024.0 * 1024.0));

    let fps = video
        .and_then(|v| v.avg_frame_rate.clone().or(v.r_frame_rate.clone()))
        .and_then(|s| parse_fps(&s))
        .filter(|f| *f > 0.0 && f.is_finite());

    Ok(MediaSummary {
        path: path.to_string(),
        duration,
        width: video.and_then(|v| v.width),
        height: video.and_then(|v| v.height),
        rotation: video.and_then(parse_rotation),
        fps,
        v_codec: video.and_then(|v| v.codec_name.clone()),
        a_codec: audio.and_then(|a| a.codec_name.clone()),
        pix_fmt: video.and_then(|v| v.pix_fmt.clone()),
        bit_rate_kbps,
        size_mb,
        has_video: video.is_some(),
        has_audio: audio.is_some(),
        container: raw.format.as_ref().and_then(|f| f.format_name.clone()),
        sample_rate: audio
            .and_then(|a| a.sample_rate.clone())
            .and_then(|s| s.parse::<i64>().ok()),
        channels: audio.and_then(|a| a.channels),
    })
}
