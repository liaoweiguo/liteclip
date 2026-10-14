import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { selectJobSpec, useStore } from "@/state/store";
import { basename, dirname } from "@/lib/time";
import type { DoneEvent, LogEvent, ProgressEvent } from "@/lib/types";
import InfoTip from "./InfoTip";

/**
 * 输出路径 + 开始导出按钮 + 进度/日志面板
 */
export default function OutputCard() {
  const output = useStore((s) => s.output);
  const setOutput = useStore((s) => s.setOutput);
  const input = useStore((s) => s.input);
  const meta = useStore((s) => s.meta);
  const overwrite = useStore((s) => s.overwrite);
  const setOverwrite = useStore((s) => s.setOverwrite);
  const task = useStore((s) => s.task);
  const startTask = useStore((s) => s.startTask);
  const updateProgress = useStore((s) => s.updateTaskProgress);
  const appendLog = useStore((s) => s.appendLog);
  const finishTask = useStore((s) => s.finishTask);
  const resetTask = useStore((s) => s.resetTask);
  const ffmpeg = useStore((s) => s.ffmpeg);

  const store = useStore();
  const spec = React.useMemo(() => selectJobSpec(store), [store]);

  // 事件订阅（在组件生命周期内保持）
  React.useEffect(() => {
    const unlisteners: UnlistenFn[] = [];
    let cancelled = false;

    (async () => {
      const u1 = await listen<ProgressEvent>("ffmpeg://progress", (ev) => {
        const p = ev.payload;
        updateProgress(p.task_id, {
          percent: p.percent,
          seconds: p.seconds,
          speed: p.speed,
          fps: p.fps,
          bitrateKbps: p.bitrate_kbps,
          sizeKb: p.size_kb,
        });
      });
      const u2 = await listen<LogEvent>("ffmpeg://log", (ev) => {
        appendLog(ev.payload.task_id, ev.payload.line);
      });
      const u3 = await listen<DoneEvent>("ffmpeg://done", (ev) => {
        const d = ev.payload;
        finishTask(d.task_id, d.success ? "success" : "error",
          d.success ? undefined : `退出码 ${d.exit_code}\n${d.tail.join("\n")}`);
      });
      if (cancelled) { u1(); u2(); u3(); return; }
      unlisteners.push(u1, u2, u3);
    })();

    return () => {
      cancelled = true;
      unlisteners.forEach((u) => u());
    };
  }, [appendLog, finishTask, updateProgress]);

  async function pick() {
    try {
      const p = await invoke<string | null>("pick_output", {
        defaultName: output ? basename(output) : (input ? basename(input) : "output.mp4"),
        defaultDir: output ? dirname(output) : (input ? dirname(input) : null),
      });
      if (p) setOutput(p);
    } catch (e) {
      console.error(e);
    }
  }

  async function run() {
    if (!spec.input || !spec.output) return;
    const id = startTask(spec.output);
    try {
      await invoke<number>("run_ffmpeg", {
        req: { taskId: id, spec: { ...spec, inputDuration: meta?.duration ?? 0 } },
      });
    } catch (e) {
      finishTask(id, "error", String(e));
    }
  }

  async function cancel() {
    if (!task || task.status !== "running") return;
    try {
      await invoke<boolean>("cancel_task", { taskId: task.id });
      finishTask(task.id, "cancelled");
    } catch (e) {
      console.error(e);
    }
  }

  async function reveal() {
    if (!task || task.status !== "success") return;
    try {
      await invoke<void>("reveal_in_folder", { path: task.output });
    } catch (e) {
      console.error(e);
    }
  }

  const canRun = !!input && !!output && !!ffmpeg && (!task || task.status !== "running");

  return (
    <section className="card p-4 flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <h2 className="card-title">⑤ 输出</h2>
        <InfoTip
          title="输出文件"
          text={"选择导出目标位置。\n• 勾选“覆盖已存在文件”将使用 -y 强制覆盖\n• 未勾选时若文件已存在，任务将失败"}
        />
      </header>

      <div className="flex items-center gap-2">
        <input
          className="input flex-1 font-mono !text-[12px]"
          placeholder="选择输出文件路径…"
          value={output}
          onChange={(e) => setOutput(e.target.value)}
        />
        <button className="btn-ghost shrink-0" onClick={pick}>浏览…</button>
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-brand-600"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
          />
          <span className="label">覆盖已存在文件 (-y)</span>
        </label>
        <div className="flex items-center gap-2">
          {task && task.status !== "running" && (
            <button className="btn-ghost !py-1.5" onClick={() => { resetTask(); }}>
              清除任务
            </button>
          )}
          {task && task.status === "success" && (
            <button className="btn-ghost !py-1.5" onClick={reveal}>
              在文件夹中显示
            </button>
          )}
          {task?.status === "running" ? (
            <button className="btn-danger" onClick={cancel}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              取消任务
            </button>
          ) : (
            <button className="btn-primary !px-5 !py-2 !text-[14px]" disabled={!canRun} onClick={run}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <polygon points="6,4 20,12 6,20" />
              </svg>
              开始导出
            </button>
          )}
        </div>
      </div>

      {!ffmpeg && (
        <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          未检测到 FFmpeg。请运行 <span className="kbd">npm run setup:ffmpeg</span> 下载 Sidecar 二进制，或在系统 PATH 中安装 ffmpeg。
        </div>
      )}

      {task && <TaskPanel taskId={task.id} />}
    </section>
  );
}

function TaskPanel({ taskId }: { taskId: string }) {
  const task = useStore((s) => s.task);
  const [showLogs, setShowLogs] = React.useState(false);
  if (!task || task.id !== taskId) return null;

  const statusLabel = {
    idle: "等待中",
    running: "导出中",
    success: "已完成",
    error: "失败",
    cancelled: "已取消",
  }[task.status];

  const statusColor = {
    idle: "bg-ink-100 text-ink-600",
    running: "bg-brand-50 text-brand-700",
    success: "bg-accent-400/15 text-accent-600",
    error: "bg-red-50 text-red-600",
    cancelled: "bg-warn-400/15 text-warn-500",
  }[task.status];

  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/40 p-3 mt-1 anim-fade-in">
      <div className="flex items-center gap-2 mb-2">
        <span className={`chip ${statusColor}`}>{statusLabel}</span>
        <span className="text-[12px] text-ink-600 font-mono truncate flex-1">{basename(task.output)}</span>
        <span className="text-[12px] font-mono text-ink-700">
          {task.percent.toFixed(1)}%
        </span>
        <button
          className="text-[11.5px] text-brand-600 hover:underline"
          onClick={() => setShowLogs((v) => !v)}
        >
          {showLogs ? "隐藏日志" : "查看日志"}
        </button>
      </div>

      {/* 进度条 */}
      <div className="h-1.5 w-full rounded-full bg-ink-200 overflow-hidden">
        <div
          className={`h-full transition-all duration-200
            ${task.status === "error" ? "bg-red-500"
              : task.status === "success" ? "bg-accent-500"
              : task.status === "cancelled" ? "bg-warn-500"
              : "bg-brand-500"}`}
          style={{ width: `${Math.min(100, Math.max(0, task.percent))}%` }}
        />
      </div>

      {task.status === "running" && (
        <div className="mt-2 grid grid-cols-4 gap-3 text-[11.5px]">
          <Stat label="已处理" value={`${task.seconds.toFixed(1)}s`} />
          <Stat label="速度" value={task.speed ? `${task.speed.toFixed(2)}×` : "—"} />
          <Stat label="帧率" value={task.fps ? `${task.fps.toFixed(0)} fps` : "—"} />
          <Stat label="输出大小" value={task.sizeKb ? `${(task.sizeKb / 1024).toFixed(1)} MB` : "—"} />
        </div>
      )}

      {task.status === "error" && task.error && (
        <pre className="mt-2 rounded-md bg-red-50 border border-red-100 p-2 text-[11.5px] text-red-700 font-mono whitespace-pre-wrap max-h-40 overflow-auto">
          {task.error}
        </pre>
      )}

      {showLogs && (
        <pre className="mt-2 rounded-md bg-ink-950 p-2 text-[11px] text-ink-200 font-mono whitespace-pre-wrap max-h-56 overflow-auto">
          {task.logs.length === 0 ? "(暂无日志)" : task.logs.join("\n")}
        </pre>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] text-ink-400">{label}</div>
      <div className="text-[12px] font-medium text-ink-800 font-mono">{value}</div>
    </div>
  );
}
