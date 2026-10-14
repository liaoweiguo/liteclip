import { create } from "zustand";
import type {
  AudioEncodeSpec,
  ContainerSpec,
  FfmpegLocation,
  FpsSpec,
  JobSpec,
  MediaSummary,
  ResizeSpec,
  RotateSpec,
  SpeedSpec,
  TrimSpec,
  VideoEncodeSpec,
} from "@/lib/types";
import { HIGH_COMPAT_PROFILE } from "@/lib/presets";
import { basename, dirname, uid, withExtension } from "@/lib/time";

export type TaskStatus = "idle" | "running" | "success" | "error" | "cancelled";

export interface TaskState {
  id: string;
  status: TaskStatus;
  percent: number;
  seconds: number;
  speed: number;
  fps: number;
  bitrateKbps: number;
  sizeKb: number;
  logs: string[];
  error?: string;
  output: string;
  startedAt: number;
  endedAt?: number;
}

interface Store {
  // ffmpeg 环境
  ffmpeg: FfmpegLocation | null;
  ffprobe: FfmpegLocation | null;
  setBinaries: (f: FfmpegLocation | null, p: FfmpegLocation | null) => void;

  // 输入 & 探测
  input: string;
  meta: MediaSummary | null;
  setInput: (p: string) => void;
  setMeta: (m: MediaSummary | null) => void;

  // 输出
  output: string;
  setOutput: (p: string) => void;

  // 编辑参数
  trim: TrimSpec;
  resize: ResizeSpec;
  rotate: RotateSpec;
  speed: SpeedSpec;
  fps: FpsSpec;
  video: VideoEncodeSpec;
  audio: AudioEncodeSpec;
  container: ContainerSpec;
  highCompat: boolean;
  overwrite: boolean;

  setTrim: (t: Partial<TrimSpec>) => void;
  setResize: (t: Partial<ResizeSpec>) => void;
  setRotate: (t: Partial<RotateSpec>) => void;
  setSpeed: (t: Partial<SpeedSpec>) => void;
  setFps: (t: Partial<FpsSpec>) => void;
  setVideo: (t: Partial<VideoEncodeSpec>) => void;
  setAudio: (t: Partial<AudioEncodeSpec>) => void;
  setContainer: (t: Partial<ContainerSpec>) => void;
  setHighCompat: (b: boolean) => void;
  setOverwrite: (b: boolean) => void;

  // 预设应用
  applyPreset: (p: {
    w?: number; h?: number; fps?: number;
    videoBitrateKbps?: number; audioBitrateKbps?: number;
    codec?: VideoEncodeSpec["codec"]; container?: ContainerSpec["format"];
  }) => void;

  // 任务
  task: TaskState | null;
  startTask: (output?: string) => string;
  updateTaskProgress: (id: string, patch: Partial<TaskState>) => void;
  appendLog: (id: string, line: string) => void;
  finishTask: (id: string, status: TaskStatus, error?: string) => void;
  resetTask: () => void;

  // 一次性重置
  resetAll: () => void;
}

const initialTrim: TrimSpec = { enabled: false, start: null, end: null };
const initialResize: ResizeSpec = {
  enabled: false, width: null, height: null, mode: "fit", padColor: "black",
};
const initialRotate: RotateSpec = { enabled: false, degrees: null, flip: null };
const initialSpeed: SpeedSpec = { enabled: false, factor: 1.0 };
const initialFps: FpsSpec = { enabled: false, fps: null };
const initialVideo: VideoEncodeSpec = {
  codec: "h264", crf: 22, preset: "medium", bitrateKbps: null,
  hwaccel: null, pixFmt: "yuv420p", profile: null,
};
const initialAudio: AudioEncodeSpec = {
  codec: "aac", bitrateKbps: 192, sampleRate: null, channels: null, volume: 1.0,
};
const initialContainer: ContainerSpec = { format: "mp4", faststart: true };

function detectPlatformHwaccel(): VideoEncodeSpec["hwaccel"] {
  // 简单启发：mac 用 videotoolbox，其它默认软编。用户可覆盖。
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac os") || ua.includes("macintosh")) return "videotoolbox";
  return null;
}

export const useStore = create<Store>((set, get) => ({
  ffmpeg: null,
  ffprobe: null,
  setBinaries: (f, p) => set({ ffmpeg: f, ffprobe: p }),

  input: "",
  meta: null,
  setInput: (p) => {
    // 输入变化时自动建议输出路径
    if (!p) return set({ input: p, meta: null });
    const dir = dirname(p);
    const name = basename(p);
    const stem = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
    const suggested = `${dir}/${stem}_liteclip.mp4`;
    set({ input: p, meta: null, output: get().output || suggested });
  },
  setMeta: (m) => {
    // 有元信息后，把 resize 默认值填成源尺寸（用户开关关闭时不影响命令）
    if (m && m.width && m.height) {
      const r = get().resize;
      if (!r.width && !r.height) {
        set({ resize: { ...r, width: m.width, height: m.height } });
      }
      const fp = get().fps;
      if (!fp.fps && m.fps) {
        set({ fps: { ...fp, fps: Math.round(m.fps * 100) / 100 } });
      }
    }
    set({ meta: m });
  },

  output: "",
  setOutput: (p) => set({ output: p }),

  trim: initialTrim,
  resize: initialResize,
  rotate: initialRotate,
  speed: initialSpeed,
  fps: initialFps,
  video: { ...initialVideo, hwaccel: detectPlatformHwaccel() },
  audio: initialAudio,
  container: initialContainer,
  highCompat: false,
  overwrite: true,

  setTrim: (t) => set({ trim: { ...get().trim, ...t } }),
  setResize: (t) => set({ resize: { ...get().resize, ...t } }),
  setRotate: (t) => set({ rotate: { ...get().rotate, ...t } }),
  setSpeed: (t) => set({ speed: { ...get().speed, ...t } }),
  setFps: (t) => set({ fps: { ...get().fps, ...t } }),
  setVideo: (t) => set({ video: { ...get().video, ...t } }),
  setAudio: (t) => set({ audio: { ...get().audio, ...t } }),
  setContainer: (t) => set({ container: { ...get().container, ...t } }),
  setHighCompat: (b) => {
    if (!b) return set({ highCompat: false });
    // 打开时同步应用高兼容默认值到具体字段，方便关闭后仍保留
    set({
      highCompat: true,
      video: {
        ...get().video,
        codec: HIGH_COMPAT_PROFILE.videoCodec,
        crf: HIGH_COMPAT_PROFILE.crf,
        preset: HIGH_COMPAT_PROFILE.preset,
        pixFmt: HIGH_COMPAT_PROFILE.pixFmt,
        profile: HIGH_COMPAT_PROFILE.profile,
        bitrateKbps: null,
      },
      audio: {
        ...get().audio,
        codec: HIGH_COMPAT_PROFILE.audioCodec,
        bitrateKbps: HIGH_COMPAT_PROFILE.audioBitrateKbps,
        sampleRate: HIGH_COMPAT_PROFILE.sampleRate,
        channels: HIGH_COMPAT_PROFILE.channels,
      },
      container: {
        format: HIGH_COMPAT_PROFILE.container,
        faststart: HIGH_COMPAT_PROFILE.faststart,
      },
      output: get().output
        ? withExtension(get().output, HIGH_COMPAT_PROFILE.container)
        : get().output,
    });
  },
  setOverwrite: (b) => set({ overwrite: b }),

  applyPreset: (p) => {
    const s = get();
    const patch: Partial<Store> = {};

    if (p.w && p.h) {
      patch.resize = {
        enabled: true, width: p.w, height: p.h,
        mode: s.resize.mode ?? "fit", padColor: s.resize.padColor ?? "black",
      };
    }
    if (p.fps) {
      patch.fps = { enabled: true, fps: p.fps };
    }
    if (p.codec) {
      patch.video = { ...s.video, codec: p.codec };
    }
    if (p.container) {
      patch.container = { ...s.container, format: p.container };
      if (s.output) {
        patch.output = withExtension(s.output, p.container);
      }
    }
    if (p.videoBitrateKbps) {
      patch.video = { ...(patch.video as VideoEncodeSpec ?? s.video), bitrateKbps: p.videoBitrateKbps, crf: null };
    }
    if (p.audioBitrateKbps) {
      patch.audio = { ...s.audio, bitrateKbps: p.audioBitrateKbps };
    }
    set(patch as Partial<Store>);
  },

  task: null,
  startTask: (output) => {
    const id = uid("task");
    const out = output ?? get().output;
    set({
      task: {
        id, status: "running", percent: 0, seconds: 0, speed: 0, fps: 0,
        bitrateKbps: 0, sizeKb: 0, logs: [], output: out, startedAt: Date.now(),
      },
    });
    return id;
  },
  updateTaskProgress: (id, patch) => {
    const t = get().task;
    if (!t || t.id !== id) return;
    set({ task: { ...t, ...patch } });
  },
  appendLog: (id, line) => {
    const t = get().task;
    if (!t || t.id !== id) return;
    const logs = t.logs.length > 400 ? t.logs.slice(t.logs.length - 400) : t.logs.slice();
    logs.push(line);
    set({ task: { ...t, logs } });
  },
  finishTask: (id, status, error) => {
    const t = get().task;
    if (!t || t.id !== id) return;
    set({ task: { ...t, status, error, endedAt: Date.now(), percent: status === "success" ? 100 : t.percent } });
  },
  resetTask: () => set({ task: null }),

  resetAll: () =>
    set({
      input: "", meta: null, output: "",
      trim: initialTrim, resize: initialResize, rotate: initialRotate,
      speed: initialSpeed, fps: initialFps,
      video: { ...initialVideo, hwaccel: detectPlatformHwaccel() },
      audio: initialAudio, container: initialContainer,
      highCompat: false, overwrite: true, task: null,
    }),
}));

/** 从当前 store 生成 JobSpec（供预览 & 提交） */
export function selectJobSpec(s: Store): JobSpec {
  const full = s.meta?.duration ?? 0;

  // 进度百分比分母：ffmpeg -progress 报告的 out_time_ms 属于「输出时间轴」，
  // 已含变速效果。因此分母应为预期输出时长 = 裁剪片段时长 ÷ 变速倍率，
  // 否则启用剪切/变速时进度条无法到达 100%。
  let span = full;
  if (s.trim.enabled) {
    const start = s.trim.start ?? 0;
    const end = s.trim.end ?? full;
    if (end > start) span = end - start;
  }
  const factor =
    s.speed.enabled && s.speed.factor && s.speed.factor > 0 ? s.speed.factor : 1;
  const expectedOut = span / factor;

  return {
    input: s.input,
    output: s.output,
    trim: s.trim,
    resize: s.resize,
    rotate: s.rotate,
    speed: s.speed,
    fps: s.fps,
    video: s.video,
    audio: s.audio,
    container: s.container,
    overwrite: s.overwrite,
    highCompat: s.highCompat,
    inputDuration: expectedOut > 0 ? expectedOut : full,
  };
}
