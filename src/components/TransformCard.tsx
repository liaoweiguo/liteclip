import React from "react";
import { useStore } from "@/state/store";
import Field from "./Field";
import InfoTip from "./InfoTip";

/**
 * 变换面板：分辨率 / 旋转 / 速度 / 帧率
 */
export default function TransformCard() {
  const resize = useStore((s) => s.resize);
  const setResize = useStore((s) => s.setResize);
  const rotate = useStore((s) => s.rotate);
  const setRotate = useStore((s) => s.setRotate);
  const speed = useStore((s) => s.speed);
  const setSpeed = useStore((s) => s.setSpeed);
  const fps = useStore((s) => s.fps);
  const setFps = useStore((s) => s.setFps);
  const meta = useStore((s) => s.meta);

  return (
    <section className="card p-4 flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <h2 className="card-title">③ 画面变换</h2>
        <InfoTip
          title="变换滤镜"
          text={"• Resize → scale + pad / crop\n• Rotate → transpose / hflip / vflip\n• Speed → setpts (视频) + atempo (音频)\n• FPS → fps 滤镜\n\n所有变换按顺序合并成一条 -vf 滤镜链，避免多次编解码。"}
        />
      </header>

      {/* ---- 分辨率 ---- */}
      <SubBlock
        title="调整分辨率"
        enabled={resize.enabled}
        onToggle={(v) => setResize({ enabled: v })}
        tipText={"把视频缩放/裁剪到目标宽高。\n• 适应 (fit)：等比缩放，两侧补黑边，画面完整\n• 填充 (fill)：等比缩放后中心裁剪，铺满整个画面\n• 拉伸 (stretch)：直接拉伸，画面会变形\n\n新：也可以直接用下方「按比例缩放」滑块，基于源尺寸百分比快速缩放。"}
        rightHint={meta?.width && meta?.height ? `源：${meta.width}×${meta.height}` : undefined}
      >
        <div className="grid grid-cols-3 gap-3">
          <Field label="宽 (px)">
            <input
              type="number"
              className="input"
              value={resize.width ?? ""}
              min={2}
              step={2}
              placeholder="1920"
              onChange={(e) => setResize({ width: e.target.valueAsNumber || null })}
            />
          </Field>
          <Field label="高 (px)">
            <input
              type="number"
              className="input"
              value={resize.height ?? ""}
              min={2}
              step={2}
              placeholder="1080"
              onChange={(e) => setResize({ height: e.target.valueAsNumber || null })}
            />
          </Field>
          <Field label="模式" tip="留空表示 -2（自动按比例计算，保证偶数）">
            <select
              className="input"
              value={resize.mode ?? "fit"}
              onChange={(e) => setResize({ mode: e.target.value as any })}
            >
              <option value="fit">适应 (加黑边)</option>
              <option value="fill">填充 (裁剪)</option>
              <option value="stretch">拉伸 (变形)</option>
            </select>
          </Field>
        </div>

        {/* 按比例缩放 */}
        <PercentScale />

        <div className="grid grid-cols-4 gap-2 mt-2">
          {[
            { l: "480p", w: 854, h: 480 },
            { l: "720p", w: 1280, h: 720 },
            { l: "1080p", w: 1920, h: 1080 },
            { l: "4K", w: 3840, h: 2160 },
            { l: "竖 9:16", w: 1080, h: 1920 },
            { l: "方 1:1", w: 1080, h: 1080 },
            { l: "小红书 3:4", w: 1080, h: 1440 },
            { l: "微信 6:7", w: 1080, h: 1260 },
          ].map((x) => (
            <button
              key={x.l}
              className="btn-ghost !py-1 !px-2 !text-[12px]"
              onClick={() => setResize({ enabled: true, width: x.w, height: x.h })}
            >
              {x.l} · {x.w}×{x.h}
            </button>
          ))}
        </div>
      </SubBlock>

      {/* ---- 旋转 / 翻转 ---- */}
      <SubBlock
        title="旋转 / 翻转"
        enabled={rotate.enabled}
        onToggle={(v) => setRotate({ enabled: v })}
        tipText={"顺时针旋转 90° / 180° / 270°，或水平/垂直翻转。\n如果视频元数据本身带 rotation，播放器会自动旋转；此处将做像素级旋转。"}
      >
        <div className="flex flex-wrap gap-2">
          {[90, 180, 270].map((d) => (
            <button
              key={d}
              className={`btn ${rotate.degrees === d ? "bg-brand-600 text-white" : "btn-ghost"}`}
              onClick={() => setRotate({ degrees: d as 90 | 180 | 270 })}
            >
              旋转 {d}°
            </button>
          ))}
          <button
            className={`btn ${rotate.flip === "h" ? "bg-brand-600 text-white" : "btn-ghost"}`}
            onClick={() => setRotate({ flip: rotate.flip === "h" ? null : "h" })}
          >
            水平翻转
          </button>
          <button
            className={`btn ${rotate.flip === "v" ? "bg-brand-600 text-white" : "btn-ghost"}`}
            onClick={() => setRotate({ flip: rotate.flip === "v" ? null : "v" })}
          >
            垂直翻转
          </button>
        </div>
      </SubBlock>

      {/* ---- 速度 ---- */}
      <SubBlock
        title="速度调整"
        enabled={speed.enabled}
        onToggle={(v) => setSpeed({ enabled: v })}
        tipText={"同时调整视频与音频速度。\n• 视频：setpts=PTS/factor\n• 音频：atempo（超过 2× 会级联多次 atempo）\n\n范围 0.25× ~ 4.0×"}
      >
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.05}
            value={speed.factor ?? 1}
            disabled={!speed.enabled}
            onChange={(e) => setSpeed({ factor: Number(e.target.value) })}
            className="flex-1 accent-brand-600"
          />
          <div className="w-20 text-right font-mono text-[13px] text-ink-700">
            {(speed.factor ?? 1).toFixed(2)}×
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {[0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((f) => (
            <button
              key={f}
              className="btn-ghost !py-1 !px-2 !text-[12px]"
              onClick={() => setSpeed({ enabled: true, factor: f })}
            >
              {f}×
            </button>
          ))}
        </div>
      </SubBlock>

      {/* ---- 帧率 ---- */}
      <SubBlock
        title="帧率 (FPS)"
        enabled={fps.enabled}
        onToggle={(v) => setFps({ enabled: v })}
        tipText={"统一输出帧率。\n• 常见 24（电影）/ 25（PAL）/ 30（NTSC/网络）/ 60（游戏/流畅）\n• 降低帧率可减小体积，升高会补帧（不新增信息）"}
        rightHint={meta?.fps ? `源：${meta.fps.toFixed(2)} fps` : undefined}
      >
        <div className="flex flex-wrap gap-1.5">
          {[23.976, 24, 25, 29.97, 30, 50, 59.94, 60].map((f) => (
            <button
              key={f}
              className={`btn ${Math.abs((fps.fps ?? 0) - f) < 0.01 ? "bg-brand-600 text-white" : "btn-ghost"} !py-1 !px-2 !text-[12px]`}
              onClick={() => setFps({ enabled: true, fps: f })}
            >
              {f}
            </button>
          ))}
          <input
            type="number"
            step={0.01}
            min={1}
            max={240}
            className="input !w-24 !py-1"
            placeholder="自定义"
            value={fps.fps && ![23.976, 24, 25, 29.97, 30, 50, 59.94, 60].includes(fps.fps) ? fps.fps : ""}
            onChange={(e) => setFps({ enabled: true, fps: e.target.valueAsNumber || null })}
          />
        </div>
      </SubBlock>
    </section>
  );
}

interface SubBlockProps {
  title: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  tipText: string;
  tipTitle?: string;
  rightHint?: string;
  children: React.ReactNode;
}

function SubBlock({ title, enabled, onToggle, tipText, tipTitle, rightHint, children }: SubBlockProps) {
  return (
    <div className={`rounded-lg border p-3 transition-colors ${enabled ? "border-brand-200 bg-brand-50/30" : "border-ink-100 bg-white"}`}>
      <div className="flex items-center gap-2 mb-2">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-brand-600"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className="label">{title}</span>
        </label>
        <InfoTip text={tipText} title={tipTitle ?? title} />
        <span className="flex-1" />
        {rightHint && <span className="hint font-mono">{rightHint}</span>}
      </div>
      <div className={enabled ? "" : "opacity-50 pointer-events-none"}>
        {children}
      </div>
    </div>
  );
}

/**
 * 按比例缩放：基于源尺寸百分比快速设定输出宽高。
 * - 滑块 10~100%（默认 100%）
 * - 自动将结果向下取偶（H.264/HEVC 要求宽高为偶数）
 * - 启用后自动将 resize.enabled = true
 * - 提供常用预设按钮：25 / 50 / 75 / 100%
 */
function PercentScale() {
  const meta = useStore((s) => s.meta);
  const resize = useStore((s) => s.resize);
  const setResize = useStore((s) => s.setResize);

  const srcW = meta?.width ?? 0;
  const srcH = meta?.height ?? 0;
  const disabled = !srcW || !srcH;

  // 从当前 resize 宽高反推百分比（以宽为准）
  const currentPct = React.useMemo(() => {
    if (disabled || !resize.width) return 100;
    const p = (resize.width / srcW) * 100;
    return Math.max(10, Math.min(100, Math.round(p)));
  }, [disabled, resize.width, srcW]);

  const [pct, setPct] = React.useState<number>(currentPct);

  // 外部尺寸变化时同步
  React.useEffect(() => {
    setPct(currentPct);
  }, [currentPct]);

  function applyPercent(p: number) {
    if (disabled) return;
    const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
    const w = even((srcW * p) / 100);
    const h = even((srcH * p) / 100);
    setPct(p);
    setResize({ enabled: true, width: w, height: h });
  }

  const previewW = disabled ? 0 : Math.max(2, Math.floor((srcW * pct) / 100 / 2) * 2);
  const previewH = disabled ? 0 : Math.max(2, Math.floor((srcH * pct) / 100 / 2) * 2);

  return (
    <div className="mt-3 rounded-lg border border-ink-100 bg-ink-50/50 p-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="label">按比例缩放</span>
        <InfoTip
          title="按比例缩放"
          text={"基于源尺寸的百分比快速缩放（保持宽高比）。\n• 范围：10% ~ 100%\n• 结果自动向下取偶（H.264/HEVC 要求）\n• 拖动后会自动启用「调整分辨率」并写入宽高\n\n需要需要先选择源文件并等待元信息解析完成。"}
        />
        <span className="flex-1" />
        {disabled ? (
          <span className="hint">需先选择源文件</span>
        ) : (
          <span className="hint font-mono">
            {srcW}×{srcH} → <b className="text-brand-700">{previewW}×{previewH}</b>
          </span>
        )}
      </div>

      <div className={`flex items-center gap-3 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
        <input
          type="range"
          min={10}
          max={100}
          step={1}
          value={pct}
          onChange={(e) => applyPercent(Number(e.target.value))}
          className="flex-1 accent-brand-600"
        />
        <div className="w-14 text-right font-mono text-[13px] text-ink-700">{pct}%</div>
        <input
          type="number"
          min={10}
          max={100}
          step={1}
          className="input !w-20 !py-1 font-mono"
          value={pct}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) applyPercent(Math.max(10, Math.min(100, Math.round(v))));
          }}
        />
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2">
        {[10, 25, 50, 75, 90, 100].map((p) => (
          <button
            key={p}
            disabled={disabled}
            className={`btn !py-0.5 !px-2 !text-[11.5px] ${
              pct === p ? "bg-brand-600 text-white" : "btn-ghost"
            } disabled:opacity-40`}
            onClick={() => applyPercent(p)}
          >
            {p}%
          </button>
        ))}
      </div>
    </div>
  );
}
