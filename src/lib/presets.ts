// 内置通用设备/平台尺寸预设
//
// 说明：
// - w/h：目标输出分辨率（像素）
// - fps：建议帧率
// - videoBitrateKbps / audioBitrateKbps：建议码率（参考各平台官方推荐值，非强制）
// - orientation：默认横竖屏方向
// - category：分组，用于 UI 分类展示
// - note：面向用户的简短说明

import type { ContainerFormat, VideoCodec } from "./types";

export interface DevicePreset {
  id: string;
  name: string;
  category: "手机" | "平板" | "短视频" | "长视频" | "直播/推流" | "通用";
  w: number;
  h: number;
  fps: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  orientation: "portrait" | "landscape";
  codec: VideoCodec;
  container: ContainerFormat;
  note?: string;
  /** 平台建议的最高分辨率档位（例如 4K） */
  variants?: { label: string; w: number; h: number; videoBitrateKbps: number }[];
}

export const PRESETS: DevicePreset[] = [
  // -------- 短视频平台（竖屏为主）--------
  {
    id: "douyin",
    name: "抖音 / TikTok",
    category: "短视频",
    w: 1080,
    h: 1920,
    fps: 30,
    videoBitrateKbps: 8000,
    audioBitrateKbps: 192,
    orientation: "portrait",
    codec: "h264",
    container: "mp4",
    note: "竖屏 9:16，推荐 1080×1920；上传后平台会二次压缩，源文件保持高码率有助于画质。",
    variants: [
      { label: "720P", w: 720, h: 1280, videoBitrateKbps: 4000 },
      { label: "1080P", w: 1080, h: 1920, videoBitrateKbps: 8000 },
    ],
  },
  {
    id: "kuaishou",
    name: "快手",
    category: "短视频",
    w: 1080,
    h: 1920,
    fps: 30,
    videoBitrateKbps: 6000,
    audioBitrateKbps: 192,
    orientation: "portrait",
    codec: "h264",
    container: "mp4",
    note: "竖屏 9:16，兼容 720×1280 与 1080×1920。",
  },
  {
    id: "xiaohongshu",
    name: "小红书",
    category: "短视频",
    w: 1080,
    h: 1440,
    fps: 30,
    videoBitrateKbps: 6000,
    audioBitrateKbps: 192,
    orientation: "portrait",
    codec: "h264",
    container: "mp4",
    note: "推荐 3:4（1080×1440）或 9:16；文件 <200MB 更利于上传。",
    variants: [
      { label: "3:4", w: 1080, h: 1440, videoBitrateKbps: 6000 },
      { label: "9:16", w: 1080, h: 1920, videoBitrateKbps: 7000 },
      { label: "1:1", w: 1080, h: 1080, videoBitrateKbps: 5000 },
    ],
  },
  {
    id: "wechat-video",
    name: "微信视频号",
    category: "短视频",
    w: 1080,
    h: 1260,
    fps: 30,
    videoBitrateKbps: 5000,
    audioBitrateKbps: 160,
    orientation: "portrait",
    codec: "h264",
    container: "mp4",
    note: "6:7 或 9:16；单文件建议 <1GB。",
  },
  {
    id: "youtube-shorts",
    name: "YouTube Shorts",
    category: "短视频",
    w: 1080,
    h: 1920,
    fps: 30,
    videoBitrateKbps: 8000,
    audioBitrateKbps: 192,
    orientation: "portrait",
    codec: "h264",
    container: "mp4",
    note: "≤60s 竖屏 9:16；也接受 4K 竖屏（2160×3840）。",
  },
  {
    id: "instagram-reels",
    name: "Instagram Reels",
    category: "短视频",
    w: 1080,
    h: 1920,
    fps: 30,
    videoBitrateKbps: 6000,
    audioBitrateKbps: 192,
    orientation: "portrait",
    codec: "h264",
    container: "mp4",
    note: "9:16 竖屏，≤90s；使用 H.264 + AAC 兼容性最佳。",
  },

  // -------- 长视频平台 --------
  {
    id: "youtube-1080",
    name: "YouTube 1080p",
    category: "长视频",
    w: 1920,
    h: 1080,
    fps: 30,
    videoBitrateKbps: 8000,
    audioBitrateKbps: 256,
    orientation: "landscape",
    codec: "h264",
    container: "mp4",
    note: "SDR 1080p 建议 8 Mbps；60fps 提升到 12 Mbps。",
    variants: [
      { label: "720p", w: 1280, h: 720, videoBitrateKbps: 5000 },
      { label: "1080p", w: 1920, h: 1080, videoBitrateKbps: 8000 },
      { label: "1440p 2K", w: 2560, h: 1440, videoBitrateKbps: 16000 },
      { label: "2160p 4K", w: 3840, h: 2160, videoBitrateKbps: 40000 },
    ],
  },
  {
    id: "youtube-4k",
    name: "YouTube 4K",
    category: "长视频",
    w: 3840,
    h: 2160,
    fps: 30,
    videoBitrateKbps: 40000,
    audioBitrateKbps: 256,
    orientation: "landscape",
    codec: "h265",
    container: "mp4",
    note: "4K 建议使用 H.265/HEVC 以节省码率；如需极致兼容选 H.264。",
  },
  {
    id: "bilibili-1080",
    name: "哔哩哔哩 1080p",
    category: "长视频",
    w: 1920,
    h: 1080,
    fps: 30,
    videoBitrateKbps: 6000,
    audioBitrateKbps: 320,
    orientation: "landscape",
    codec: "h264",
    container: "mp4",
    note: "1080p 高码率模式建议 6~10 Mbps；音频 320kbps AAC。",
    variants: [
      { label: "720p", w: 1280, h: 720, videoBitrateKbps: 3000 },
      { label: "1080p", w: 1920, h: 1080, videoBitrateKbps: 6000 },
      { label: "1080p+", w: 1920, h: 1080, videoBitrateKbps: 10000 },
      { label: "4K", w: 3840, h: 2160, videoBitrateKbps: 20000 },
    ],
  },
  {
    id: "vimeo",
    name: "Vimeo",
    category: "长视频",
    w: 1920,
    h: 1080,
    fps: 30,
    videoBitrateKbps: 10000,
    audioBitrateKbps: 320,
    orientation: "landscape",
    codec: "h264",
    container: "mp4",
    note: "Vimeo 对画质较友好，建议 10 Mbps 起。",
  },

  // -------- 手机（拍摄 / 存档）--------
  {
    id: "iphone-1080",
    name: "iPhone 1080p",
    category: "手机",
    w: 1920,
    h: 1080,
    fps: 30,
    videoBitrateKbps: 8000,
    audioBitrateKbps: 192,
    orientation: "landscape",
    codec: "h264",
    container: "mov",
    note: "iPhone 相册直接播放，兼容 QuickTime。",
    variants: [
      { label: "720p", w: 1280, h: 720, videoBitrateKbps: 4000 },
      { label: "1080p", w: 1920, h: 1080, videoBitrateKbps: 8000 },
      { label: "4K", w: 3840, h: 2160, videoBitrateKbps: 30000 },
    ],
  },
  {
    id: "iphone-4k-hevc",
    name: "iPhone 4K (HEVC)",
    category: "手机",
    w: 3840,
    h: 2160,
    fps: 30,
    videoBitrateKbps: 25000,
    audioBitrateKbps: 192,
    orientation: "landscape",
    codec: "h265",
    container: "mov",
    note: "使用 HEVC 显著减小体积，需 iOS 11+ / macOS 10.13+。",
  },
  {
    id: "android-1080",
    name: "Android 1080p",
    category: "手机",
    w: 1920,
    h: 1080,
    fps: 30,
    videoBitrateKbps: 6000,
    audioBitrateKbps: 192,
    orientation: "landscape",
    codec: "h264",
    container: "mp4",
    note: "绝大多数 Android 机型原生支持 H.264 + AAC / MP4。",
  },
  {
    id: "wechat-moments",
    name: "微信朋友圈",
    category: "手机",
    w: 1280,
    h: 720,
    fps: 30,
    videoBitrateKbps: 2500,
    audioBitrateKbps: 128,
    orientation: "landscape",
    codec: "h264",
    container: "mp4",
    note: "朋友圈视频限 15s（普通用户）/ 30s；文件 <25MB 上传更稳。",
  },

  // -------- 平板 --------
  {
    id: "ipad",
    name: "iPad",
    category: "平板",
    w: 1920,
    h: 1080,
    fps: 30,
    videoBitrateKbps: 8000,
    audioBitrateKbps: 192,
    orientation: "landscape",
    codec: "h264",
    container: "mp4",
    note: "iPad 兼容 1080p / 4K H.264 与 HEVC。",
  },
  {
    id: "android-tablet",
    name: "Android 平板",
    category: "平板",
    w: 1920,
    h: 1200,
    fps: 30,
    videoBitrateKbps: 8000,
    audioBitrateKbps: 192,
    orientation: "landscape",
    codec: "h264",
    container: "mp4",
    note: "16:10 常见平板分辨率。",
  },

  // -------- 直播 / 推流 --------
  {
    id: "rtmp-1080",
    name: "RTMP 推流 1080p",
    category: "直播/推流",
    w: 1920,
    h: 1080,
    fps: 30,
    videoBitrateKbps: 4500,
    audioBitrateKbps: 160,
    orientation: "landscape",
    codec: "h264",
    container: "mp4",
    note: "适合 OBS / 抖音直播伴侣等；码率 3~6 Mbps，GOP 2s。",
  },
  {
    id: "rtmp-720",
    name: "RTMP 推流 720p",
    category: "直播/推流",
    w: 1280,
    h: 720,
    fps: 30,
    videoBitrateKbps: 2500,
    audioBitrateKbps: 128,
    orientation: "landscape",
    codec: "h264",
    container: "mp4",
    note: "弱网/移动网络首选。",
  },

  // -------- 通用 --------
  {
    id: "hd-720",
    name: "通用 720p",
    category: "通用",
    w: 1280,
    h: 720,
    fps: 30,
    videoBitrateKbps: 3000,
    audioBitrateKbps: 160,
    orientation: "landscape",
    codec: "h264",
    container: "mp4",
    note: "小体积通用分发。",
  },
  {
    id: "fhd-1080",
    name: "通用 1080p",
    category: "通用",
    w: 1920,
    h: 1080,
    fps: 30,
    videoBitrateKbps: 6000,
    audioBitrateKbps: 192,
    orientation: "landscape",
    codec: "h264",
    container: "mp4",
    note: "标准全高清输出。",
  },
  {
    id: "uhd-4k",
    name: "通用 4K",
    category: "通用",
    w: 3840,
    h: 2160,
    fps: 30,
    videoBitrateKbps: 30000,
    audioBitrateKbps: 256,
    orientation: "landscape",
    codec: "h265",
    container: "mp4",
    note: "4K 建议使用 HEVC 以控制体积。",
  },
  {
    id: "square-1080",
    name: "方形 1:1",
    category: "通用",
    w: 1080,
    h: 1080,
    fps: 30,
    videoBitrateKbps: 5000,
    audioBitrateKbps: 192,
    orientation: "landscape",
    codec: "h264",
    container: "mp4",
    note: "适合社交媒体信息流。",
  },
];

export const PRESET_CATEGORIES: DevicePreset["category"][] = [
  "短视频",
  "长视频",
  "手机",
  "平板",
  "直播/推流",
  "通用",
];

/** 通过 id 查找 */
export function getPreset(id: string): DevicePreset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/** 根据宽高自动匹配最接近的预设（仅用于展示建议） */
export function matchPresetBySize(w: number, h: number): DevicePreset | undefined {
  let best: DevicePreset | undefined;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const p of PRESETS) {
    const delta = Math.abs(p.w - w) + Math.abs(p.h - h);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = p;
    }
  }
  return best;
}

/**
 * 高兼容性模式：H.264 + AAC + yuv420p + faststart + MP4
 * 这是"任何设备都能播"的保险档。
 */
export const HIGH_COMPAT_PROFILE = {
  videoCodec: "h264" as VideoCodec,
  audioCodec: "aac" as const,
  pixFmt: "yuv420p",
  container: "mp4" as ContainerFormat,
  faststart: true,
  profile: "high",
  crf: 23,
  preset: "medium",
  audioBitrateKbps: 192,
  sampleRate: 48000,
  channels: 2,
};
