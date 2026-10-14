import React from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useStore } from "@/state/store";
import { formatDuration } from "@/lib/time";
import InfoTip from "./InfoTip";

/**
 * 视频预览卡片
 *
 * - 用 HTML5 <video> + Tauri asset 协议加载本地文件
 * - 预览框按目标分辨率宽高比锁定，直观看到 resize 效果
 *   • fit     → object-fit: contain（补黑边）
 *   • fill    → object-fit: cover  （裁剪）
 *   • stretch → object-fit: fill   （拉伸变形）
 * - 底部时间轴：可拖动的 [起点 / 终点] 手柄 + 当前播放头
 * - 支持一键把播放头设为起点/终点，跳到起点/终点，逐帧步进
 * - 自动尊重视频的 rotation 元数据（CSS transform）
 */
export default function PreviewCard() {
  const input = useStore((s) => s.input);
  const meta = useStore((s) => s.meta);
  const trim = useStore((s) => s.trim);
  const setTrim = useStore((s) => s.setTrim);
  const resize = useStore((s) => s.resize);
  const rotate = useStore((s) => s.rotate);

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = React.useState(false);
  const [current, setCurrent] = React.useState(0);
  const [nativeDur, setNativeDur] = React.useState(0);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);

  // 拖拽状态
  const [dragging, setDragging] = React.useState<null | "start" | "end" | "playhead">(null);

  const src = React.useMemo(() => (input ? convertFileSrc(input) : null), [input]);

  const duration = nativeDur > 0 ? nativeDur : (meta?.duration ?? 0);
  const trimStart = trim.enabled ? (trim.start ?? 0) : 0;
  const trimEnd = trim.enabled ? (trim.end ?? duration) : duration;

  // 预览宽高比：resize 启用时用目标尺寸，否则用源尺寸
  const targetW = resize.enabled && resize.width ? resize.width : (meta?.width ?? 16);
  const targetH = resize.enabled && resize.height ? resize.height : (meta?.height ?? 9);
  const aspect = targetW / targetH;

  // object-fit 映射
  const objectFit: React.CSSProperties["objectFit"] = !resize.enabled
    ? "contain"
    : resize.mode === "fill"
    ? "cover"
    : resize.mode === "stretch"
    ? "fill"
    : "contain";

  // rotation：优先手动 rotate，其次源元数据
  const rotateDeg =
    (rotate.enabled ? (rotate.degrees ?? 0) : 0) +
    ((meta?.rotation ?? 0) && !rotate.enabled ? (meta?.rotation as number) : 0);

  // ---------------- video 事件 ----------------
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrent(v.currentTime);
    const onDur = () => {
      setNativeDur(v.duration || 0);
      // WebKit/macOS 在仅加载元信息时不会自动绘制首帧（黑屏），
      // 需要显式 seek 到目标位置才能触发解码。
      // 若 trim 已启用则定位到起点，否则定位到 0.001s（避开某些浏览器对 0 的忽略）。
      const target = trim.enabled && trim.start != null && trim.start > 0
        ? trim.start
        : 0.001;
      try {
        // 使用 requestAnimationFrame 确保 src 已绑定完成
        requestAnimationFrame(() => {
          try { v.currentTime = target; } catch { /* ignore */ }
        });
      } catch { /* ignore */ }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onErr = () => setLoadErr("浏览器无法解码此文件，可尝试导出后预览");
    const onLoadedData = () => {
      // 部分情况下 loadedmetadata 时 seek 会被忽略，再补一次
      if (v.currentTime === 0 && !v.paused === false) {
        try { v.currentTime = 0.001; } catch { /* ignore */ }
      }
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onDur);
    v.addEventListener("loadeddata", onLoadedData);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("error", onErr);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onDur);
      v.removeEventListener("loadeddata", onLoadedData);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("error", onErr);
    };
    // 仅在 src / trim 启用状态变化时重新绑定；trimStart 具体值变化时不重新 seek（避免干扰用户）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, trim.enabled]);

  // 播放头超出 trim 末端时暂停（模拟导出效果）
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v || !trim.enabled) return;
    if (trimEnd > 0 && v.currentTime > trimEnd + 0.05) {
      v.pause();
      v.currentTime = trimEnd;
    }
  }, [current, trim.enabled, trimEnd]);

  // 输入变化时重置
  React.useEffect(() => {
    setCurrent(0);
    setNativeDur(0);
    setLoadErr(null);
    setPlaying(false);
  }, [input]);

  // ---------------- 控制 ----------------
  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      // 若当前在 trim 之外，从起点开始
      if (trim.enabled && (v.currentTime < trimStart || v.currentTime >= trimEnd)) {
        v.currentTime = trimStart;
      }
      v.play().catch(() => undefined);
    } else {
      v.pause();
    }
  }

  function seek(t: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration || t, t));
    setCurrent(v.currentTime);
  }

  function stepFrame(delta: number) {
    const fps = meta?.fps ?? 30;
    seek(current + delta / fps);
  }

  function setStartHere() {
    if (!trim.enabled) setTrim({ enabled: true });
    setTrim({ start: Number(current.toFixed(3)) });
  }
  function setEndHere() {
    if (!trim.enabled) setTrim({ enabled: true });
    setTrim({ end: Number(current.toFixed(3)) });
  }

  // ---------------- 时间轴拖拽 ----------------
  function posToTime(clientX: number): number {
    const el = trackRef.current;
    if (!el || !duration) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }

  function onTrackMouseDown(e: React.MouseEvent, handle: "start" | "end" | "playhead" | null) {
    e.preventDefault();
    e.stopPropagation();
    if (!duration) return;

    if (handle === "start") {
      setDragging("start");
    } else if (handle === "end") {
      setDragging("end");
    } else {
      // 点击轨道空白 → 移动播放头
      seek(posToTime(e.clientX));
      setDragging("playhead");
    }
  }

  React.useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const t = posToTime(e.clientX);
      if (dragging === "start") {
        setTrim({ enabled: true, start: Number(Math.min(t, (trim.end ?? duration) - 0.05).toFixed(3)) });
      } else if (dragging === "end") {
        setTrim({ enabled: true, end: Number(Math.max(t, (trim.start ?? 0) + 0.05).toFixed(3)) });
      } else if (dragging === "playhead") {
        seek(t);
      }
    };
    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, duration, trim.start, trim.end, setTrim]);

  // ---------------- 渲染 ----------------
  if (!input) {
    return (
      <section className="card p-4">
        <header className="flex items-center gap-2 mb-3">
          <h2 className="card-title">画面预览</h2>
          <InfoTip
            title="预览说明"
            text={"选择源文件后，这里会显示实时预览。\n• 预览框的宽高比 = 目标输出分辨率\n• 拖拽时间轴上的手柄可调整起点/终点\n• 点击“设为起点/终点”可用当前播放头精确定位"}
          />
        </header>
        <div
          className="rounded-lg border border-dashed border-ink-200 bg-ink-50/40
                     flex items-center justify-center text-[12px] text-ink-400"
          style={{ aspectRatio: "16 / 9", minHeight: 160 }}
        >
          请先选择源文件
        </div>
      </section>
    );
  }

  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);
  const showTrim = trim.enabled;

  return (
    <section className="card p-4 flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <h2 className="card-title">画面预览</h2>
        <InfoTip
          title="预览说明"
          text={"• 预览框宽高比 = 目标输出分辨率\n• Fit 模式两侧的黑边即为 pad（导出会保留）\n• Fill 模式看到的部分即为导出后画面（超出被裁掉）\n• Stretch 模式的变形效果与导出一致\n\n注：预览使用 WebView 原生解码，某些编码（如 HEVC 10bit / AV1）浏览器可能不支持，此时不影响导出。"}
        />
        <span className="flex-1" />
        <span className="chip-brand font-mono">
          {resize.enabled && resize.width && resize.height
            ? `${resize.width}×${resize.height}`
            : meta?.width && meta?.height
            ? `${meta.width}×${meta.height} (源)`
            : "—"}
        </span>
      </header>

      {/* 视频区 */}
      <div className="relative w-full">
        <div
          className="relative w-full rounded-lg overflow-hidden bg-black shadow-inner"
          style={{ aspectRatio: `${targetW} / ${targetH}`, maxHeight: 320 }}
        >
          {src && (
            <video
              ref={videoRef}
              src={src}
              className="absolute inset-0 h-full w-full"
              style={{
                objectFit,
                transform: rotateDeg ? `rotate(${rotateDeg}deg)` : undefined,
                background: "#000",
              }}
              playsInline
              preload="auto"
              muted
              onClick={togglePlay}
            />
          )}
          {loadErr && (
            <div className="absolute inset-0 flex items-center justify-center text-[12px] text-warn-400 bg-black/60 px-4 text-center">
              {loadErr}
            </div>
          )}
          {/* 中央播放按钮（暂停时显示） */}
          {!playing && !loadErr && (
            <button
              onClick={togglePlay}
              className="absolute inset-0 m-auto h-12 w-12 rounded-full bg-white/85
                         flex items-center justify-center shadow-pop
                         hover:bg-white transition-colors"
              aria-label="播放"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-ink-800 ml-0.5" fill="currentColor">
                <polygon points="6,4 20,12 6,20" />
              </svg>
            </button>
          )}
          {/* 角标：trim 区间提示 */}
          {showTrim && (
            <div className="absolute top-2 left-2 chip bg-black/60 text-white backdrop-blur-sm font-mono">
              {formatDuration(trimStart)} → {formatDuration(trimEnd)}
            </div>
          )}
        </div>
      </div>

      {/* 控制条 */}
      <div className="flex items-center gap-1.5">
        <IconBtn title="后退 1 帧" onClick={() => stepFrame(-1)}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="19,20 9,12 19,4" fill="currentColor" />
            <line x1="5" y1="4" x2="5" y2="20" />
          </svg>
        </IconBtn>
        <IconBtn title={playing ? "暂停" : "播放"} onClick={togglePlay} primary>
          {playing ? (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <polygon points="6,4 20,12 6,20" />
            </svg>
          )}
        </IconBtn>
        <IconBtn title="前进 1 帧" onClick={() => stepFrame(1)}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5,4 15,12 5,20" fill="currentColor" />
            <line x1="19" y1="4" x2="19" y2="20" />
          </svg>
        </IconBtn>

        <div className="mx-2 h-4 w-px bg-ink-200" />

        <IconBtn title="跳到起点" onClick={() => seek(showTrim ? trimStart : 0)} disabled={!showTrim}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <rect x="4" y="4" width="2" height="16" rx="0.5" />
            <polygon points="20,4 8,12 20,20" />
          </svg>
        </IconBtn>
        <IconBtn title="跳到终点" onClick={() => seek(showTrim ? trimEnd : duration)} disabled={!showTrim}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <polygon points="4,4 16,12 4,20" />
            <rect x="18" y="4" width="2" height="16" rx="0.5" />
          </svg>
        </IconBtn>

        <div className="flex-1" />

        <span className="font-mono text-[11.5px] text-ink-600">
          <span className="text-brand-700 font-medium">{formatDuration(current)}</span>
          <span className="text-ink-400"> / {formatDuration(duration)}</span>
        </span>
      </div>

      {/* 时间轴 */}
      <div className="flex flex-col gap-1.5">
        <div
          ref={trackRef}
          onMouseDown={(e) => onTrackMouseDown(e, null)}
          className="relative h-8 rounded-md bg-ink-100 cursor-pointer select-none
                     overflow-visible"
        >
          {/* 灰底代表整段时长，蓝色代表 trim 保留段 */}
          {showTrim ? (
            <>
              <div
                className="absolute inset-y-0 bg-brand-500/25 rounded-md"
                style={{ left: `${pct(trimStart)}%`, width: `${pct(trimEnd - trimStart)}%` }}
              />
              {/* 起点手柄 */}
              <Handle
                left={`${pct(trimStart)}%`}
                onMouseDown={(e) => onTrackMouseDown(e, "start")}
                label="起点"
              />
              {/* 终点手柄 */}
              <Handle
                left={`${pct(trimEnd)}%`}
                onMouseDown={(e) => onTrackMouseDown(e, "end")}
                label="终点"
              />
            </>
          ) : (
            <div className="absolute inset-y-0 inset-x-0 bg-brand-500/15 rounded-md" />
          )}
          {/* 播放头 */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none"
            style={{ left: `${pct(current)}%` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 h-2 w-2 rounded-full bg-red-500 shadow" />
          </div>
        </div>

        {/* trim 快捷操作 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button className="btn-ghost !py-1 !px-2 !text-[11.5px]" onClick={setStartHere}>
            ⬇ 设为起点
          </button>
          <button className="btn-ghost !py-1 !px-2 !text-[11.5px]" onClick={setEndHere}>
            ⬇ 设为终点
          </button>
          <span className="flex-1" />
          {showTrim ? (
            <>
              <span className="hint font-mono">
                起点 {formatDuration(trimStart)} · 终点 {formatDuration(trimEnd)} · 输出{" "}
                <span className="text-brand-700 font-medium">
                  {formatDuration(Math.max(0, trimEnd - trimStart))}
                </span>
              </span>
              <button
                className="btn-ghost !py-1 !px-2 !text-[11.5px]"
                onClick={() => setTrim({ enabled: false, start: null, end: null })}
              >
                清除剪切
              </button>
            </>
          ) : (
            <button
              className="btn-ghost !py-1 !px-2 !text-[11.5px]"
              onClick={() => setTrim({ enabled: true, start: 0, end: duration })}
            >
              启用剪切
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
function IconBtn({
  children, title, onClick, disabled, primary,
}: {
  children: React.ReactNode; title: string; onClick: () => void;
  disabled?: boolean; primary?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed
        ${primary
          ? "bg-brand-600 text-white hover:bg-brand-700 shadow-sm"
          : "bg-ink-100 text-ink-700 hover:bg-ink-200"}`}
    >
      {children}
    </button>
  );
}

function Handle({
  left, onMouseDown, label,
}: { left: string; onMouseDown: (e: React.MouseEvent) => void; label: string }) {
  return (
    <div
      onMouseDown={onMouseDown}
      title={`${label}（拖动调整）`}
      className="absolute top-0 bottom-0 w-3 -translate-x-1/2 cursor-ew-resize group"
      style={{ left }}
    >
      <div
        className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 rounded-full
                   bg-brand-600 group-hover:bg-brand-700 transition-colors"
      />
      <div
        className="absolute -top-1 left-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full
                   bg-white border-2 border-brand-600 shadow"
      />
    </div>
  );
}
