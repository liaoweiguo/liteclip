import React from "react";
import { useStore } from "@/state/store";

/**
 * 顶部导航：应用标题 / FFmpeg 状态 / 高兼容性模式开关
 */
export default function Header() {
  const ffmpeg = useStore((s) => s.ffmpeg);
  const highCompat = useStore((s) => s.highCompat);
  const setHighCompat = useStore((s) => s.setHighCompat);

  const isSidecar = ffmpeg?.kind === "sidecar";
  const isSystem = ffmpeg?.kind === "system";
  const missing = !ffmpeg;

  return (
    <header
      className="h-14 flex items-center px-5 border-b border-ink-100
                 bg-white/80 backdrop-blur-md"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex items-center gap-2.5" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <Logo />
        <div className="leading-tight">
          <div className="text-[15px] font-semibold text-ink-900">LiteClip</div>
          <div className="text-[11px] text-ink-400">轻量视频剪辑 · FFmpeg Sidecar</div>
        </div>
      </div>

      <div className="flex-1" />

      {/* FFmpeg 状态 */}
      <div
        className="flex items-center gap-2 mr-4"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        title={ffmpeg?.path ?? "未检测到 FFmpeg"}
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            missing ? "bg-red-500 anim-pulse-soft" : isSidecar ? "bg-accent-500" : "bg-warn-500"
          }`}
        />
        <span className="text-[12px] text-ink-600">
          {missing ? (
            <span className="text-red-600">未检测到 FFmpeg</span>
          ) : (
            <>
              FFmpeg · {isSidecar ? "内置 Sidecar" : "系统 PATH"}
              {ffmpeg?.version && (
                <span className="text-ink-400 ml-1.5 font-mono text-[11px]">
                  {ffmpeg.version.split(" ")[2] ?? ""}
                </span>
              )}
            </>
          )}
        </span>
      </div>

      {/* 高兼容性开关 */}
      <label
        className="flex items-center gap-2 cursor-pointer select-none"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <span className="text-[12px] text-ink-600">高兼容性模式</span>
        <span className="relative inline-flex">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={highCompat}
            onChange={(e) => setHighCompat(e.target.checked)}
          />
          <span
            className="w-9 h-5 rounded-full bg-ink-200 peer-checked:bg-brand-500 transition-colors"
          />
          <span
            className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow
                       transition-transform peer-checked:translate-x-4"
          />
        </span>
      </label>
    </header>
  );
}

function Logo() {
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg
                     bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
      {/* 简化的剪刀 / 播放三角图标 */}
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="6,4 20,12 6,20" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}
