import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useStore, selectJobSpec } from "@/state/store";
import { buildArgs, buildCommandLine } from "@/lib/ffmpeg";
import { uid } from "@/lib/time";
import type { DoneEvent, LogEvent, ProgressEvent } from "@/lib/types";
import InfoTip from "./InfoTip";

/**
 * 命令预览 + 自定义命令模式：
 * - 默认：只读预览由 UI 参数生成的 ffmpeg 命令
 * - 自定义模式：可编辑命令，点击「运行」直接执行（走 run_ffmpeg_raw）
 *   编辑格式为「一行一个参数」，避免 shell 引号/转义困扰。
 */
export default function CommandPreview() {
  const store = useStore();
  const [tab, setTab] = React.useState<"args" | "line">("args");
  const [copied, setCopied] = React.useState(false);
  const [customMode, setCustomMode] = React.useState(false);
  const [customText, setCustomText] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);

  const task = useStore((s) => s.task);
  const startTask = useStore((s) => s.startTask);
  const updateProgress = useStore((s) => s.updateTaskProgress);
  const appendLog = useStore((s) => s.appendLog);
  const finishTask = useStore((s) => s.finishTask);
  const meta = useStore((s) => s.meta);
  const ffmpeg = useStore((s) => s.ffmpeg);

  const spec = React.useMemo(() => selectJobSpec(store), [store]);
  const ready = !!spec.input && !!spec.output;
  const autoArgs = React.useMemo(() => (ready ? buildArgs(spec) : []), [ready, spec]);
  const autoLine = React.useMemo(() => (ready ? buildCommandLine(spec) : ""), [ready, spec]);

  // 进入自定义模式时用自动生成的参数初始化文本
  React.useEffect(() => {
    if (customMode && !customText.trim() && autoArgs.length) {
      setCustomText(autoArgs.join("\n"));
    }
  }, [customMode, autoArgs, customText]);

  // 非自定义模式下，UI 改动应刷新 customText（如果它没被手动改过，就跟随）
  const [customDirty, setCustomDirty] = React.useState(false);
  React.useEffect(() => {
    if (customMode && !customDirty && autoArgs.length) {
      setCustomText(autoArgs.join("\n"));
    }
  }, [customMode, customDirty, autoArgs]);

  // 事件订阅（与 OutputCard 独立，因为可能同时存在任务）
  React.useEffect(() => {
    const unlisteners: UnlistenFn[] = [];
    let cancelled = false;
    (async () => {
      const u1 = await listen<ProgressEvent>("ffmpeg://progress", (ev) => {
        const p = ev.payload;
        updateProgress(p.task_id, {
          percent: p.percent, seconds: p.seconds, speed: p.speed,
          fps: p.fps, bitrateKbps: p.bitrate_kbps, sizeKb: p.size_kb,
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
    return () => { cancelled = true; unlisteners.forEach((u) => u()); };
  }, [appendLog, finishTask, updateProgress]);

  async function copy() {
    const text = tab === "args" ? autoArgs.map(quote).join(" ") : autoLine;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  async function runCustom() {
    setErr(null);
    const args = parseArgsText(customText);
    if (args.length === 0) {
      setErr("命令为空");
      return;
    }
    // 安全检查：不允许把 ffmpeg 二进制名当参数
    const cleaned = args[0] === "ffmpeg" ? args.slice(1) : args;
    if (cleaned.length === 0) {
      setErr("没有有效参数");
      return;
    }
    if (!ffmpeg) {
      setErr("未检测到 FFmpeg，无法执行");
      return;
    }
    // 输出路径 = 参数中最后一个非 flag token（用于任务面板显示）
    const outputGuess = [...cleaned].reverse().find((a) => !a.startsWith("-")) ?? "(custom)";
    const id = startTask(outputGuess);
    try {
      await invoke<number>("run_ffmpeg_raw", {
        req: {
          taskId: id,
          args: cleaned,
          durationHint: meta?.duration ?? null,
        },
      });
    } catch (e) {
      finishTask(id, "error", String(e));
    }
  }

  function resetCustom() {
    setCustomText(autoArgs.join("\n"));
    setCustomDirty(false);
    setErr(null);
  }

  const running = task?.status === "running";

  return (
    <section className="card p-4 flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <h2 className="card-title">⑥ FFmpeg 命令</h2>
        <InfoTip
          title="命令预览 / 自定义执行"
          text={"默认展示由 UI 参数实时生成的 ffmpeg 命令。\n\n勾选「自定义」后可编辑命令并直接运行：\n• 编辑区一行一个参数（避免 shell 引号问题）\n• 首行如为 ffmpeg 会被自动忽略\n• 支持单引号 / 双引号包裹含空格的参数\n• 执行仍走内置 sidecar，不经过 shell"}
        />
        <span className="flex-1" />

        {/* 视图切换（只在非自定义模式下显示） */}
        {!customMode && (
          <div className="flex items-center gap-1 rounded-lg bg-ink-100 p-0.5">
            <button
              className={`px-2 py-0.5 rounded-md text-[11.5px] font-medium transition-colors
                ${tab === "args" ? "bg-white shadow-sm text-ink-800" : "text-ink-500"}`}
              onClick={() => setTab("args")}
            >
              参数列表
            </button>
            <button
              className={`px-2 py-0.5 rounded-md text-[11.5px] font-medium transition-colors
                ${tab === "line" ? "bg-white shadow-sm text-ink-800" : "text-ink-500"}`}
              onClick={() => setTab("line")}
            >
              单行命令
            </button>
          </div>
        )}

        <button className="btn-ghost !py-1 !px-2 !text-[12px]" onClick={copy} disabled={!ready}>
          {copied ? "已复制 ✓" : "复制"}
        </button>

        {/* 自定义模式开关 */}
        <label className="flex items-center gap-1.5 cursor-pointer select-none ml-1">
          <span className="text-[11.5px] text-ink-600">自定义</span>
          <span className="relative inline-flex">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={customMode}
              onChange={(e) => setCustomMode(e.target.checked)}
            />
            <span className="w-8 h-4 rounded-full bg-ink-200 peer-checked:bg-warn-500 transition-colors" />
            <span
              className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow
                         transition-transform peer-checked:translate-x-4"
            />
          </span>
        </label>
      </header>

      {!ready && !customMode ? (
        <div className="hint rounded-lg border border-dashed border-ink-200 p-4 text-center">
          选择输入 & 输出文件后，这里会实时展示等效的 FFmpeg 命令
        </div>
      ) : !customMode ? (
        <div className="rounded-lg bg-ink-950 p-3 overflow-auto max-h-[220px]">
          {tab === "args" ? (
            <pre className="font-mono text-[11.5px] leading-relaxed text-ink-100 whitespace-pre-wrap break-all">
              <span className="text-accent-400">ffmpeg</span>{" "}
              {autoArgs.map((a, i) => (
                <React.Fragment key={i}>
                  <span className={a.startsWith("-") ? "text-brand-300" : "text-warn-400"}>
                    {quote(a)}
                  </span>{" "}
                </React.Fragment>
              ))}
            </pre>
          ) : (
            <pre className="font-mono text-[11.5px] leading-relaxed text-ink-100 whitespace-pre-wrap break-all">
              {autoLine}
            </pre>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-warn-400/40 bg-warn-400/5 p-2 flex items-start gap-2">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-warn-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4" /><path d="M12 17h.01" />
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
            <div className="text-[11.5px] text-ink-700 leading-relaxed">
              <b>自定义模式：</b>下方参数将<b>直接执行</b>，跳过 UI 校验。请确保命令合法且不会覆盖重要文件。
              <span className="text-ink-500"> 一行一个参数；含空格用引号包裹。</span>
            </div>
          </div>

          <textarea
            spellCheck={false}
            className="w-full rounded-lg bg-ink-950 text-ink-100 font-mono text-[12px]
                       leading-relaxed p-3 border border-ink-700 focus:border-brand-500
                       focus:ring-2 focus:ring-brand-500/20 outline-none resize-y"
            style={{ minHeight: 180 }}
            value={customText}
            onChange={(e) => { setCustomText(e.target.value); setCustomDirty(true); }}
            placeholder={"-y\n-i\n/path/to/input.mp4\n-c:v\nlibx264\n-crf\n22\noutput.mp4"}
          />

          {err && (
            <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 whitespace-pre-wrap">
              {err}
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="hint font-mono">
              共 <b className="text-ink-700">{parseArgsText(customText).length}</b> 个参数
            </span>
            <span className="flex-1" />
            <button
              className="btn-ghost !py-1 !px-2 !text-[12px]"
              onClick={resetCustom}
              disabled={running}
            >
              重置为自动生成
            </button>
            <button
              className="btn-primary !py-1.5 !px-4 !text-[13px]"
              onClick={runCustom}
              disabled={running || !ffmpeg}
            >
              {running ? (
                <>
                  <span className="inline-block h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  运行中…
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                    <polygon points="6,4 20,12 6,20" />
                  </svg>
                  运行
                </>
              )}
            </button>
          </div>

          {task && <CustomTaskPanel taskId={task.id} />}
        </>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
function CustomTaskPanel({ taskId }: { taskId: string }) {
  const task = useStore((s) => s.task);
  const [showLogs, setShowLogs] = React.useState(false);
  const resetTask = useStore((s) => s.resetTask);
  if (!task || task.id !== taskId) return null;

  const statusLabel = {
    idle: "等待中", running: "运行中", success: "已完成", error: "失败", cancelled: "已取消",
  }[task.status];
  const statusColor = {
    idle: "bg-ink-100 text-ink-600",
    running: "bg-brand-50 text-brand-700",
    success: "bg-accent-400/15 text-accent-600",
    error: "bg-red-50 text-red-600",
    cancelled: "bg-warn-400/15 text-warn-500",
  }[task.status];

  return (
    <div className="rounded-lg border border-ink-100 bg-ink-50/40 p-3 anim-fade-in">
      <div className="flex items-center gap-2 mb-2">
        <span className={`chip ${statusColor}`}>{statusLabel}</span>
        <span className="text-[12px] text-ink-600 font-mono truncate flex-1">{task.output}</span>
        <span className="text-[12px] font-mono text-ink-700">{task.percent.toFixed(1)}%</span>
        <button
          className="text-[11.5px] text-brand-600 hover:underline"
          onClick={() => setShowLogs((v) => !v)}
        >
          {showLogs ? "隐藏日志" : "查看日志"}
        </button>
        {task.status !== "running" && (
          <button className="text-[11.5px] text-ink-500 hover:underline" onClick={resetTask}>
            清除
          </button>
        )}
      </div>
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

// -----------------------------------------------------------------------------
// 引号 & 参数解析
// -----------------------------------------------------------------------------
function quote(s: string): string {
  return /\s/.test(s) ? `'${s.replace(/'/g, "'\\''")}'` : s;
}

/**
 * 把「一行一个参数」的文本解析为参数数组。
 * 也允许一行内多个参数（用空格分隔），支持单/双引号包裹含空格 token。
 */
export function parseArgsText(text: string): string[] {
  const out: string[] = [];
  // 先按行分割，再对每行做 shell-like tokenization
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line.trim()) continue;
    if (line.trimStart().startsWith("#")) continue; // 支持注释
    let i = 0;
    while (i < line.length) {
      // 跳过空白
      while (i < line.length && /\s/.test(line[i])) i++;
      if (i >= line.length) break;
      let token = "";
      while (i < line.length && !/\s/.test(line[i])) {
        const ch = line[i];
        if (ch === "'") {
          // 单引号：读到下一个单引号（不处理转义）
          i++;
          while (i < line.length && line[i] !== "'") { token += line[i++]; }
          i++; // 跳过闭合引号
        } else if (ch === '"') {
          // 双引号：支持 \" 转义
          i++;
          while (i < line.length && line[i] !== '"') {
            if (line[i] === "\\" && i + 1 < line.length) { token += line[i + 1]; i += 2; }
            else { token += line[i++]; }
          }
          i++;
        } else if (ch === "\\" && i + 1 < line.length) {
          token += line[i + 1]; i += 2;
        } else {
          token += line[i++];
        }
      }
      if (token.length > 0) out.push(token);
    }
  }
  return out;
}

// 保留 uid 引用（供未来扩展使用）
void uid;
