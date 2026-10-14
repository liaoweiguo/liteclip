// 前端 FFmpeg 参数构建器（与 Rust 端 build_args 保持一致的逻辑）
// 目的：让 UI 能实时预览将执行的命令，用户点击"执行"后 Rust 端做最终构建。
//
// ⚠️ 若修改，请同步 src-tauri/src/commands.rs::build_args

import type { JobSpec } from "./types";
import { HIGH_COMPAT_PROFILE } from "./presets";

function pickH264Encoder(hw?: string | null): string {
  switch (hw) {
    case "videotoolbox": return "h264_videotoolbox";
    case "nvenc": return "h264_nvenc";
    case "qsv": return "h264_qsv";
    case "vaapi": return "h264_vaapi";
    default: return "libx264";
  }
}

function pickHevcEncoder(hw?: string | null): string {
  switch (hw) {
    case "videotoolbox": return "hevc_videotoolbox";
    case "nvenc": return "hevc_nvenc";
    case "qsv": return "hevc_qsv";
    case "vaapi": return "hevc_vaapi";
    default: return "libx265";
  }
}

/**
 * x264/x265 preset 字符串 → SVT-AV1 0~13 整数预设（越大越快）
 * libsvtav1 不接受 "medium" 这种字符串，需要映射。
 */
function mapPresetToSvtAv1(p?: string | null): number | null {
  if (!p) return null;
  const s = p.trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n)) return Math.max(0, Math.min(13, Math.round(n)));
  switch (s) {
    case "ultrafast": return 12;
    case "superfast": return 11;
    case "veryfast":  return 10;
    case "faster":    return 9;
    case "fast":      return 8;
    case "medium":    return 6;
    case "slow":      return 5;
    case "slower":    return 4;
    case "veryslow":  return 2;
    case "placebo":   return 1;
    default: return null;
  }
}

export function buildArgs(spec: JobSpec): string[] {
  const a: string[] = [];
  const highCompat = !!spec.highCompat;

  if (spec.overwrite !== false) a.push("-y");

  const v = spec.video ?? { codec: "h264" };
  const au = spec.audio ?? { codec: "aac" };
  const c = spec.container ?? { format: "mp4", faststart: true };

  // 硬件加速（-i 之前）
  const hw = highCompat ? null : v.hwaccel ?? null;
  if (hw && hw !== "none" && hw !== "auto") {
    if (hw === "videotoolbox") a.push("-hwaccel", "videotoolbox");
    else if (hw === "nvenc") a.push("-hwaccel", "cuda");
    else if (hw === "qsv") a.push("-hwaccel", "qsv");
    else if (hw === "vaapi") a.push("-hwaccel", "vaapi");
  }

  // 剪切（作为输入选项，放在 -i 之前）
  // 必须在 setpts 变速滤镜之前裁剪，否则 speed>1 时输出终点会被等比拉长。
  const t = spec.trim;
  if (t?.enabled) {
    const start = t.start != null && t.start > 0 ? t.start : 0;
    if (start > 0) a.push("-ss", start.toFixed(3));
    if (t.end != null && t.end > start) a.push("-t", (t.end - start).toFixed(3));
  }

  a.push("-i", spec.input);

  // 滤镜链
  const filters: string[] = [];
  const r = spec.resize;
  if (r?.enabled) {
    const w = r.width ?? -2;
    const h = r.height ?? -2;
    const mode = r.mode ?? "fit";
    const padColor = r.padColor ?? "black";
    if (mode === "fit") {
      filters.push(`scale=w=${w}:h=${h}:force_original_aspect_ratio=decrease`);
      filters.push(`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=${padColor}`);
    } else if (mode === "fill") {
      filters.push(`scale=w=${w}:h=${h}:force_original_aspect_ratio=increase`);
      filters.push(`crop=${w}:${h}`);
    } else {
      filters.push(`scale=${w}:${h}`);
    }
    filters.push("scale=trunc(iw/2)*2:trunc(ih/2)*2");
  }

  const rt = spec.rotate;
  if (rt?.enabled) {
    if (rt.degrees === 90) filters.push("transpose=1");
    else if (rt.degrees === 180) filters.push("transpose=1,transpose=1");
    else if (rt.degrees === 270) filters.push("transpose=2");
    if (rt.flip === "h") filters.push("hflip");
    if (rt.flip === "v") filters.push("vflip");
  }

  const sp = spec.speed;
  const speedOn = !!(sp?.enabled && sp.factor && Math.abs(sp.factor - 1) > 1e-3);
  if (speedOn) filters.push(`setpts=PTS/${(sp!.factor as number).toFixed(4)}`);

  const fp = spec.fps;
  if (fp?.enabled && fp.fps && fp.fps > 0) filters.push(`fps=${fp.fps}`);

  if (filters.length) a.push("-vf", filters.join(","));

  // 视频编码
  const codec = highCompat ? HIGH_COMPAT_PROFILE.videoCodec : v.codec;
  if (codec === "copy") {
    a.push("-c:v", "copy");
  } else if (codec === "h264") {
    const enc = pickH264Encoder(hw);
    a.push("-c:v", enc);
    if (v.bitrateKbps && v.bitrateKbps > 0) {
      a.push("-b:v", `${v.bitrateKbps}k`);
      a.push("-maxrate", `${Math.round(v.bitrateKbps * 1.45)}k`);
      a.push("-bufsize", `${v.bitrateKbps * 2}k`);
    } else {
      const crf = v.crf ?? (highCompat ? HIGH_COMPAT_PROFILE.crf : 22);
      if (enc === "libx264") a.push("-crf", String(crf));
      else if (enc === "h264_videotoolbox") a.push("-q:v", String(Math.max(20, Math.min(60, 60 - crf))));
      else if (enc === "h264_nvenc") a.push("-cq", String(crf));
      else a.push("-crf", String(crf));
      if (v.preset && (enc === "libx264" || enc === "h264_nvenc")) {
        a.push("-preset", v.preset);
      }
    }
    a.push("-pix_fmt", v.pixFmt ?? "yuv420p");
    if (highCompat) {
      a.push("-profile:v", "high", "-level", "4.0");
    } else if (v.profile) {
      a.push("-profile:v", v.profile);
    }
  } else if (codec === "h265") {
    const enc = pickHevcEncoder(hw);
    a.push("-c:v", enc);
    if (v.bitrateKbps && v.bitrateKbps > 0) a.push("-b:v", `${v.bitrateKbps}k`);
    else if (v.crf) a.push(enc === "libx265" ? "-crf" : "-q:v", String(v.crf));
    if (v.preset && enc === "libx265") a.push("-preset", v.preset);
    a.push("-pix_fmt", v.pixFmt ?? "yuv420p");
    a.push("-tag:v", "hvc1");
  } else if (codec === "av1") {
    a.push("-c:v", "libsvtav1");
    if (v.crf) a.push("-crf", String(v.crf));
    const svt = mapPresetToSvtAv1(v.preset);
    if (svt != null) a.push("-preset", String(svt));
  } else if (codec === "vp9") {
    a.push("-c:v", "libvpx-vp9");
    if (v.bitrateKbps) a.push("-b:v", `${v.bitrateKbps}k`);
    else {
      a.push("-b:v", "0");
      if (v.crf) a.push("-crf", String(v.crf));
    }
  }

  // 音频编码
  const acodec = highCompat ? HIGH_COMPAT_PROFILE.audioCodec : au.codec;
  if (acodec === "none") a.push("-an");
  else if (acodec === "copy") a.push("-c:a", "copy");
  else if (acodec === "aac") {
    a.push("-c:a", "aac");
    a.push("-b:a", `${au.bitrateKbps ?? (highCompat ? 192 : 160)}k`);
    if (au.sampleRate) a.push("-ar", String(au.sampleRate));
    else if (highCompat) a.push("-ar", "48000");
    if (au.channels) a.push("-ac", String(au.channels));
    else if (highCompat) a.push("-ac", "2");
  } else if (acodec === "mp3") {
    a.push("-c:a", "libmp3lame", "-b:a", `${au.bitrateKbps ?? 192}k`);
  } else if (acodec === "opus") {
    a.push("-c:a", "libopus", "-b:a", `${au.bitrateKbps ?? 128}k`);
  }

  // 音频变速（atempo 级联）
  if (speedOn && acodec !== "copy" && acodec !== "none") {
    const f = sp!.factor as number;
    const chain: string[] = [];
    let remain = f;
    while (remain > 2.0) { chain.push("atempo=2.0"); remain /= 2.0; }
    while (remain < 0.5) { chain.push("atempo=0.5"); remain /= 0.5; }
    chain.push(`atempo=${remain.toFixed(4)}`);
    a.push("-af", chain.join(","));
  }

  // 音量
  if (au.volume != null && Math.abs(au.volume - 1) > 1e-3 && au.volume > 0
      && acodec !== "copy" && acodec !== "none") {
    const volFilter = `volume=${au.volume.toFixed(3)}`;
    const i = a.indexOf("-af");
    if (i !== -1) a[i + 1] = `${a[i + 1]},${volFilter}`;
    else a.push("-af", volFilter);
  }

  // 容器
  const fmt = highCompat ? HIGH_COMPAT_PROFILE.container : c.format;
  if ((fmt === "mp4" || fmt === "mov") && (c.faststart || highCompat)) {
    a.push("-movflags", "+faststart");
  }
  if (fmt === "gif") a.push("-loop", "0");

  a.push(spec.output);
  return a;
}

/** 输出为单行命令字符串，供预览复制 */
export function buildCommandLine(spec: JobSpec, binName = "ffmpeg"): string {
  const args = buildArgs(spec);
  const q = (s: string) => (/\s/.test(s) ? `'${s.replace(/'/g, "'\\''")}'` : s);
  return [binName, ...args.map(q)].join(" ");
}
