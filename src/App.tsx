import React from "react";
import { invoke } from "@tauri-apps/api/core";
import Header from "@/components/Header";
import SourceCard from "@/components/SourceCard";
import PresetCard from "@/components/PresetCard";
import PreviewCard from "@/components/PreviewCard";
import TransformCard from "@/components/TransformCard";
import EncodeCard from "@/components/EncodeCard";
import OutputCard from "@/components/OutputCard";
import CommandPreview from "@/components/CommandPreview";
import { useStore } from "@/state/store";
import type { FfmpegLocation, MediaSummary } from "@/lib/types";

/**
 * 应用主布局：顶栏 + 三列工作区（左：源/预设，中：变换/编码，右：输出/预览）
 */
export default function App() {
  const setBinaries = useStore((s) => s.setBinaries);
  const setInput = useStore((s) => s.setInput);
  const setMeta = useStore((s) => s.setMeta);
  const highCompat = useStore((s) => s.highCompat);

  // 启动时探测 ffmpeg / ffprobe
  React.useEffect(() => {
    (async () => {
      try {
        const s = await invoke<{ ffmpeg: FfmpegLocation | null; ffprobe: FfmpegLocation | null }>(
          "ffmpeg_status"
        );
        setBinaries(s.ffmpeg ?? null, s.ffprobe ?? null);
      } catch (e) {
        console.error("ffmpeg_status failed:", e);
      }
    })();
  }, [setBinaries]);

  // 全局拖放（在 App 层接管，避免 webview 打开文件）
  React.useEffect(() => {
    const prevent = (e: DragEvent) => { e.preventDefault(); };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", async (e) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      const f = files[0] as unknown as { path?: string } | undefined;
      if (f?.path) {
        setInput(f.path);
        try {
          const m = await invoke<MediaSummary>("probe_media", { path: f.path });
          setMeta(m);
        } catch (err) {
          console.error(err);
        }
      }
    });
    return () => window.removeEventListener("dragover", prevent);
  }, [setInput, setMeta]);

  return (
    <div className="h-screen flex flex-col bg-ink-50">
      <Header />

      {highCompat && (
        <div className="px-5 py-2 bg-accent-400/10 border-b border-accent-400/20 text-[12px] text-accent-600 flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span>
            <b>高兼容性模式已启用：</b>强制使用 H.264 (High@4.0) + AAC 192kbps + yuv420p + MP4 + faststart，
            可在 iOS/Android/Windows/macOS/主流浏览器与电视盒子上直接播放。
          </span>
        </div>
      )}

      <main className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full grid grid-cols-[minmax(340px,1fr)_minmax(420px,1.25fr)_minmax(360px,1fr)] gap-3 p-3 overflow-auto">
          {/* 左列 */}
          <div className="flex flex-col gap-3 min-w-0">
            <SourceCard />
            <PresetCard />
          </div>

          {/* 中列 */}
          <div className="flex flex-col gap-3 min-w-0">
            <PreviewCard />
            <TransformCard />
            <EncodeCard />
          </div>

          {/* 右列 */}
          <div className="flex flex-col gap-3 min-w-0">
            <OutputCard />
            <CommandPreview />
            <Footer />
          </div>
        </div>
      </main>
    </div>
  );
}

function Footer() {
  const ffmpeg = useStore((s) => s.ffmpeg);
  return (
    <div className="card p-3 text-[11px] text-ink-400 leading-relaxed">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-medium text-ink-600">提示</span>
      </div>
      <ul className="list-disc pl-4 space-y-0.5">
        <li>点击标题右侧「?」查看每个参数的详细说明与推荐值。</li>
        <li>命令预览可复制到终端手动执行，方便排错。</li>
        <li>
          当前 FFmpeg：
          <span className="font-mono text-ink-600">
            {ffmpeg ? `${ffmpeg.kind} · ${ffmpeg.path}` : "未检测到"}
          </span>
        </li>
        <li>如未内置 Sidecar，可运行 <span className="kbd">npm run setup:ffmpeg</span> 下载。</li>
      </ul>
    </div>
  );
}
