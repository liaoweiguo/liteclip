// 与 Rust 端 (src-tauri/src/commands.rs) 保持一致的编辑参数类型定义

export interface TrimSpec {
  enabled: boolean;
  start?: number | null; // 秒
  end?: number | null;   // 秒
}

export type ResizeMode = "fit" | "fill" | "stretch";

export interface ResizeSpec {
  enabled: boolean;
  width?: number | null;
  height?: number | null;
  mode?: ResizeMode;
  padColor?: string;
}

export interface RotateSpec {
  enabled: boolean;
  degrees?: 0 | 90 | 180 | 270 | null;
  flip?: "h" | "v" | null;
}

export interface SpeedSpec {
  enabled: boolean;
  factor?: number | null; // 0.25 ~ 4.0
}

export interface FpsSpec {
  enabled: boolean;
  fps?: number | null;
}

export type VideoCodec = "h264" | "h265" | "av1" | "vp9" | "copy";
export type AudioCodec = "aac" | "mp3" | "opus" | "copy" | "none";
export type ContainerFormat = "mp4" | "mov" | "mkv" | "webm" | "gif";
export type HwAccel = "auto" | "videotoolbox" | "nvenc" | "qsv" | "vaapi" | "none";

export interface VideoEncodeSpec {
  codec: VideoCodec;
  crf?: number | null;
  preset?: string | null;
  bitrateKbps?: number | null;
  hwaccel?: HwAccel | null;
  pixFmt?: string | null;
  profile?: string | null;
}

export interface AudioEncodeSpec {
  codec: AudioCodec;
  bitrateKbps?: number | null;
  sampleRate?: number | null;
  channels?: number | null;
  volume?: number | null;
}

export interface ContainerSpec {
  format: ContainerFormat;
  faststart: boolean;
}

export interface JobSpec {
  input: string;
  output: string;
  trim?: TrimSpec;
  resize?: ResizeSpec;
  rotate?: RotateSpec;
  speed?: SpeedSpec;
  fps?: FpsSpec;
  video?: VideoEncodeSpec;
  audio?: AudioEncodeSpec;
  container?: ContainerSpec;
  overwrite?: boolean;
  highCompat?: boolean;
  inputDuration?: number;
}

export interface MediaSummary {
  path: string;
  duration: number;
  width?: number | null;
  height?: number | null;
  rotation?: number | null;
  fps?: number | null;
  v_codec?: string | null;
  a_codec?: string | null;
  pix_fmt?: string | null;
  bit_rate_kbps?: number | null;
  size_mb?: number | null;
  has_video: boolean;
  has_audio: boolean;
  container?: string | null;
  sample_rate?: number | null;
  channels?: number | null;
}

export interface FfmpegLocation {
  kind: "sidecar" | "system" | string;
  path: string;
  version?: string | null;
}

export interface ProgressEvent {
  task_id: string;
  seconds: number;
  percent: number;
  speed: number;
  fps: number;
  bitrate_kbps: number;
  size_kb: number;
  done?: boolean;
}

export interface DoneEvent {
  task_id: string;
  exit_code: number;
  success: boolean;
  tail: string[];
}

export interface LogEvent {
  task_id: string;
  line: string;
}
