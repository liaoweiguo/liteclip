import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "@/state/store";
import {
  basename, formatBitrate, formatDuration, formatSize, parseTimeInput,
} from "@/lib/time";
import Field from "./Field";
import InfoTip from "./InfoTip";
import type { MediaSummary } from "@/lib/types";

/**
 * 输入源卡片：文件选择 / 拖放 / 元信息展示 / 时间裁剪
 */
export default function SourceCard() {
  const input = useStore((s) => s.input);
  const meta = useStore((s) => s.meta);
  const setInput = useStore((s) => s.setInput);
  const setMeta = useStore((s) => s.setMeta);
  const trim = useStore((s) => s.trim);
  const setTrim = useStore((s) => s.setTrim);
  const [dragOver, setDragOver] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function handlePath(p: string) {
    if (!p) return;
    setBusy(true);
    setErr(null);
    setInput(p);
    try {
      const m = await invoke<MediaSummary>("probe_media", { path: p });
      setMeta(m);
    } catch (e) {
      setErr(String(e));
      setMeta(null);
    } finally {
      setBusy(false);
    }
  }

  async function pick() {
    try {
      const p = await invoke<string | null>("pick_input");
      if (p) await handlePath(p);
    } catch (e) {
      setErr(String(e));
    }
  }

  // 拖放支持
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    const f = files[0] as unknown as { path?: string; name?: string };
    // Tauri v2 webview 通常提供 f.path
    if (f.path) await handlePath(f.path);
    else setErr("无法读取拖放文件路径，请使用文件选择器。");
  };

  return (
    <section className="card p-4 flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <h2 className="card-title">① 选择源文件</h2>
        <InfoTip
          title="支持格式"
          text={"视频：mp4 / mov / mkv / avi / webm / flv / wmv / m4v\n音频：mp3 / wav / m4a / aac / flac / ogg / opus\nGIF：gif"}
        />
        <span className="flex-1" />
        {busy && <span className="chip-brand">解析中…</span>}
        {meta && !busy && <span className="chip-accent">已解析</span>}
      </header>

      {!input ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`rounded-xl2 border-2 border-dashed transition-colors
            flex flex-col items-center justify-center gap-2 py-10
            ${dragOver ? "border-brand-400 bg-brand-50" : "border-ink-200 bg-ink-50/40"}`}
        >
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-brand-500" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4" />
            <path d="m7 9 5-5 5 5" />
            <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
          <div className="text-[13px] text-ink-700">
            把视频/音频文件<span className="font-medium">拖到这里</span>，或
          </div>
          <button type="button" className="btn-primary mt-1" onClick={pick}>
            浏览本地文件…
          </button>
          <div className="hint mt-1">支持几乎所有常见格式（FFmpeg 解码）</div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-lg bg-ink-50 border border-ink-100 px-3 py-2">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-brand-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="6,4 20,12 6,20" />
            </svg>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-ink-800 truncate">{basename(input)}</div>
              <div className="hint truncate">{input}</div>
            </div>
            <button className="btn-ghost" onClick={pick}>更换</button>
          </div>

          {err && (
            <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 whitespace-pre-wrap">
              {err}
            </div>
          )}

          {meta && <MetaGrid meta={meta} />}

          {/* 裁剪 */}
          <div className="rounded-lg border border-ink-100 p-3 bg-white">
            <div className="flex items-center gap-2 mb-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-brand-600"
                  checked={trim.enabled}
                  onChange={(e) => setTrim({ enabled: e.target.checked })}
                />
                <span className="label">剪切时间段（Trim）</span>
              </label>
              <InfoTip
                title="剪切（-ss / -to）"
                text={"只保留 [开始, 结束] 区间。\n• 留空表示从 0 开始 / 到末尾结束\n• 支持 HH:MM:SS.ms 或纯秒数\n• 精确到帧（对关键帧不敏感，可能引入极短的头部延迟）"}
              />
              <span className="flex-1" />
              {meta && trim.enabled && (
                <span className="hint">
                  预计输出{" "}
                  <span className="font-medium text-ink-700">
                    {formatDuration(Math.max(0, (trim.end ?? meta.duration) - (trim.start ?? 0)))}
                  </span>
                </span>
              )}
            </div>
            {trim.enabled && (
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <Field label="开始">
                  <input
                    className="input"
                    placeholder="00:00:00.000"
                    defaultValue={trim.start != null ? formatDuration(trim.start) : ""}
                    onBlur={(e) => setTrim({ start: parseTimeInput(e.target.value) })}
                  />
                </Field>
                <span className="pb-2 text-ink-400">→</span>
                <Field label="结束" hint={meta ? `源时长 ${formatDuration(meta.duration)}` : undefined}>
                  <input
                    className="input"
                    placeholder={meta ? formatDuration(meta.duration) : "00:00:30.000"}
                    defaultValue={trim.end != null ? formatDuration(trim.end) : ""}
                    onBlur={(e) => setTrim({ end: parseTimeInput(e.target.value) })}
                  />
                </Field>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function MetaGrid({ meta }: { meta: MediaSummary }) {
  const items: [string, string][] = [
    ["时长", formatDuration(meta.duration)],
    ["分辨率", meta.width && meta.height ? `${meta.width}×${meta.height}` : "—"],
    ["帧率", meta.fps ? `${meta.fps.toFixed(2)} fps` : "—"],
    ["视频编码", (meta.v_codec ?? "—").toUpperCase()],
    ["音频编码", (meta.a_codec ?? "—").toUpperCase()],
    ["像素格式", meta.pix_fmt ?? "—"],
    ["码率", formatBitrate(meta.bit_rate_kbps)],
    ["大小", formatSize(meta.size_mb)],
  ];
  return (
    <div className="grid grid-cols-4 gap-x-3 gap-y-2 rounded-lg bg-ink-50/60 border border-ink-100 p-3">
      {items.map(([k, v]) => (
        <div key={k}>
          <div className="text-[11px] text-ink-400">{k}</div>
          <div className="text-[12.5px] font-medium text-ink-800 font-mono">{v}</div>
        </div>
      ))}
      {meta.rotation != null && meta.rotation !== 0 && (
        <div className="col-span-4">
          <span className="chip-warn">旋转元数据：{meta.rotation}°（导出时将保留）</span>
        </div>
      )}
    </div>
  );
}
