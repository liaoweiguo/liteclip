import React from "react";
import { useStore } from "@/state/store";
import { PRESETS, PRESET_CATEGORIES, type DevicePreset } from "@/lib/presets";
import InfoTip from "./InfoTip";

/**
 * 内置设备尺寸预设选择面板。
 * 选中后会一次性写入 resize / fps / video-bitrate / audio-bitrate / codec / container。
 */
export default function PresetCard() {
  const [cat, setCat] = React.useState<DevicePreset["category"] | "全部">("全部");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const applyPreset = useStore((s) => s.applyPreset);
  const setOutput = useStore((s) => s.setOutput);
  const output = useStore((s) => s.output);
  const withExtension = React.useCallback((p: string, ext: string) => {
    if (!p) return p;
    const i = p.lastIndexOf(".");
    const stem = i === -1 ? p : p.slice(0, i);
    return `${stem}.${ext}`;
  }, []);

  const cats: (DevicePreset["category"] | "全部")[] = ["全部", ...PRESET_CATEGORIES];
  const list = cat === "全部" ? PRESETS : PRESETS.filter((p) => p.category === cat);

  function apply(p: DevicePreset) {
    setActiveId(p.id);
    applyPreset({
      w: p.w,
      h: p.h,
      fps: p.fps,
      videoBitrateKbps: p.videoBitrateKbps,
      audioBitrateKbps: p.audioBitrateKbps,
      codec: p.codec,
      container: p.container,
    });
    if (output) setOutput(withExtension(output, p.container));
  }

  return (
    <section className="card p-4 flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <h2 className="card-title">② 目标设备 / 平台预设</h2>
        <InfoTip
          title="预设做了什么？"
          text={"一次点击同时设置：\n• 输出分辨率（Resize）\n• 帧率（FPS）\n• 视频码率 / 音频码率\n• 编码器（H.264 / H.265）\n• 容器格式（MP4 / MOV / WebM）\n\n你也可以在下面的面板中再单独微调。"}
        />
      </header>

      {/* 分类 */}
      <div className="flex flex-wrap gap-1.5">
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`px-2.5 py-1 rounded-lg text-[12px] font-medium transition-colors
              ${cat === c
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-ink-50 text-ink-600 hover:bg-ink-100"}`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* 预设网格 */}
      <div className="grid grid-cols-2 gap-2 max-h-[260px] overflow-y-auto pr-1">
        {list.map((p) => (
          <button
            key={p.id}
            onClick={() => apply(p)}
            title={p.note}
            className={`text-left rounded-lg border px-3 py-2 transition-all
              ${activeId === p.id
                ? "border-brand-500 bg-brand-50 shadow-sm"
                : "border-ink-100 bg-white hover:border-brand-200 hover:bg-brand-50/40"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium text-ink-800 truncate">
                {p.name}
              </span>
              <span
                className={`chip shrink-0 ${
                  p.orientation === "portrait"
                    ? "bg-brand-50 text-brand-700"
                    : "bg-ink-100 text-ink-600"
                }`}
              >
                {p.orientation === "portrait" ? "竖" : "横"}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-500 font-mono">
              <span>{p.w}×{p.h}</span>
              <span className="text-ink-300">·</span>
              <span>{p.fps}fps</span>
              <span className="text-ink-300">·</span>
              <span>{Math.round(p.videoBitrateKbps / 100) / 10}M</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
