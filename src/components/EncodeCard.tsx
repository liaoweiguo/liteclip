import React from "react";
import { useStore } from "@/state/store";
import Field from "./Field";
import InfoTip from "./InfoTip";
import type { AudioCodec, ContainerFormat, HwAccel, VideoCodec } from "@/lib/types";

/**
 * 编码面板：视频编码 / 音频编码 / 容器
 */
export default function EncodeCard() {
  const video = useStore((s) => s.video);
  const setVideo = useStore((s) => s.setVideo);
  const audio = useStore((s) => s.audio);
  const setAudio = useStore((s) => s.setAudio);
  const container = useStore((s) => s.container);
  const setContainer = useStore((s) => s.setContainer);
  const highCompat = useStore((s) => s.highCompat);
  const output = useStore((s) => s.output);
  const setOutput = useStore((s) => s.setOutput);

  const disabled = highCompat;

  function changeContainer(fmt: ContainerFormat) {
    setContainer({ format: fmt });
    if (output) {
      const i = output.lastIndexOf(".");
      const stem = i === -1 ? output : output.slice(0, i);
      setOutput(`${stem}.${fmt}`);
    }
  }

  return (
    <section className="card p-4 flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <h2 className="card-title">④ 编码与容器</h2>
        <InfoTip
          title="如何选择？"
          text={"• 追求兼容：H.264 + AAC + MP4（任何设备都能播）\n• 追求体积：H.265 / AV1（同画质体积小 30%~50%）\n• 无需重编码：选 “copy” 直接封装（最快，无画质损失）\n\nCRF：数值越小画质越好、体积越大。x264 建议 18~28，默认 22。\nPreset：越慢压缩率越高（ultrafast → veryslow）。"}
        />
        {highCompat && <span className="chip-accent ml-1">高兼容性模式已锁定</span>}
      </header>

      {/* ---- 视频编码 ---- */}
      <div className={`rounded-lg border p-3 ${disabled ? "border-accent-400/40 bg-accent-400/5" : "border-ink-100 bg-white"}`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="label">视频编码</span>
          <InfoTip
            title="视频编码器"
            text={"H.264：兼容性最好，几乎所有设备/浏览器都支持\nH.265/HEVC：同画质省 30~50% 空间，需要较新设备\nAV1：新一代开源编码，压缩率更高，编码较慢\nVP9：WebM 常用，浏览器友好\nCopy：不重编码，直接拷贝（无法配合 Resize/Trim 精修）"}
          />
        </div>
        <div className="grid grid-cols-5 gap-2 mb-3">
          {(["h264", "h265", "av1", "vp9", "copy"] as VideoCodec[]).map((c) => (
            <button
              key={c}
              disabled={disabled}
              onClick={() => setVideo({ codec: c })}
              className={`btn ${video.codec === c ? "bg-brand-600 text-white" : "btn-ghost"} disabled:opacity-50`}
            >
              {c === "h265" ? "H.265" : c === "h264" ? "H.264" : c === "copy" ? "Copy (直拷)" : c.toUpperCase()}
            </button>
          ))}
        </div>

        {video.codec !== "copy" && (
          <div className="grid grid-cols-3 gap-3">
            <Field
              label="质量模式"
              tip="CRF：恒定质量（推荐）；固定码率：恒定大小（用于流媒体）"
            >
              <select
                className="input"
                disabled={disabled}
                value={video.bitrateKbps ? "bitrate" : "crf"}
                onChange={(e) => {
                  if (e.target.value === "bitrate") setVideo({ bitrateKbps: 6000, crf: null });
                  else setVideo({ bitrateKbps: null, crf: 22 });
                }}
              >
                <option value="crf">CRF (恒定质量)</option>
                <option value="bitrate">固定码率</option>
              </select>
            </Field>

            {video.bitrateKbps ? (
              <Field label="视频码率 (kbps)" tip="1000 kbps = 1 Mbps。1080p 常用 4000~8000；4K 20000+">
                <input
                  type="number"
                  min={200}
                  step={100}
                  className="input"
                  disabled={disabled}
                  value={video.bitrateKbps ?? ""}
                  onChange={(e) => setVideo({ bitrateKbps: e.target.valueAsNumber || null })}
                />
              </Field>
            ) : (
              <Field
                label={`CRF · ${video.crf ?? 22}`}
                tip="x264/x265：18~28 常用；越小画质越好，体积越大。VideoToolbox 使用 -q:v 自动换算。"
              >
                <input
                  type="range"
                  min={15}
                  max={35}
                  step={1}
                  className="w-full accent-brand-600"
                  disabled={disabled}
                  value={video.crf ?? 22}
                  onChange={(e) => setVideo({ crf: Number(e.target.value) })}
                />
              </Field>
            )}

            <Field
              label="Preset"
              tip="编码速度与压缩率的权衡：ultrafast → veryslow。慢速档能在同 CRF 下产生更小文件。"
            >
              <select
                className="input"
                disabled={disabled}
                value={video.preset ?? "medium"}
                onChange={(e) => setVideo({ preset: e.target.value })}
              >
                {["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {video.codec !== "copy" && (
          <div className="grid grid-cols-3 gap-3 mt-3">
            <Field
              label="硬件加速"
              tip="VideoToolbox (macOS) / NVENC (NVIDIA) / QSV (Intel) / VAAPI (Linux)\n开启后编码速度可提升 3~10 倍，但同码率画质略低于 x264 软编。"
            >
              <select
                className="input"
                disabled={disabled}
                value={video.hwaccel ?? "none"}
                onChange={(e) => setVideo({ hwaccel: (e.target.value === "none" ? null : e.target.value) as HwAccel | null })}
              >
                <option value="none">关闭 (软编 libx264)</option>
                <option value="videotoolbox">VideoToolbox (macOS)</option>
                <option value="nvenc">NVENC (NVIDIA)</option>
                <option value="qsv">Quick Sync (Intel)</option>
                <option value="vaapi">VAAPI (Linux)</option>
              </select>
            </Field>
            <Field
              label="像素格式"
              tip="yuv420p 兼容性最好（几乎所有播放器/浏览器）；yuv420p10le 保留 10bit 色深，需要较新设备。"
            >
              <select
                className="input"
                disabled={disabled}
                value={video.pixFmt ?? "yuv420p"}
                onChange={(e) => setVideo({ pixFmt: e.target.value })}
              >
                <option value="yuv420p">yuv420p (8bit, 兼容)</option>
                <option value="yuv420p10le">yuv420p10le (10bit)</option>
                <option value="nv12">nv12 (硬件加速常用)</option>
              </select>
            </Field>
            <Field
              label="Profile (H.264)"
              tip="high 兼容性最好且压缩率高；main 略旧；baseline 用于极老设备（不支持 B 帧）。"
            >
              <select
                className="input"
                disabled={disabled || video.codec !== "h264"}
                value={video.profile ?? ""}
                onChange={(e) => setVideo({ profile: e.target.value || null })}
              >
                <option value="">自动</option>
                <option value="baseline">baseline</option>
                <option value="main">main</option>
                <option value="high">high</option>
              </select>
            </Field>
          </div>
        )}
      </div>

      {/* ---- 音频编码 ---- */}
      <div className={`rounded-lg border p-3 ${disabled ? "border-accent-400/40 bg-accent-400/5" : "border-ink-100 bg-white"}`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="label">音频编码</span>
          <InfoTip
            title="音频编码器"
            text={"AAC：MP4/MOV 的默认选择，兼容所有主流设备\nMP3：兼容性极佳，但压缩率一般\nOpus：现代高效编码，WebM 首选\nCopy：不重编码（当输入已经是目标编码时最快）\nNone：移除音频轨"}
          />
        </div>
        <div className="grid grid-cols-5 gap-2 mb-3">
          {(["aac", "mp3", "opus", "copy", "none"] as AudioCodec[]).map((c) => (
            <button
              key={c}
              disabled={disabled}
              onClick={() => setAudio({ codec: c })}
              className={`btn ${audio.codec === c ? "bg-brand-600 text-white" : "btn-ghost"} disabled:opacity-50`}
            >
              {c === "none" ? "去除音轨" : c === "copy" ? "Copy (直拷)" : c.toUpperCase()}
            </button>
          ))}
        </div>

        {audio.codec !== "copy" && audio.codec !== "none" && (
          <div className="grid grid-cols-4 gap-3">
            <Field label="码率 (kbps)" tip="语音 96~128；音乐 192~320">
              <select
                className="input"
                disabled={disabled}
                value={audio.bitrateKbps ?? 192}
                onChange={(e) => setAudio({ bitrateKbps: Number(e.target.value) })}
              >
                {[96, 128, 160, 192, 256, 320].map((b) => (
                  <option key={b} value={b}>{b} kbps</option>
                ))}
              </select>
            </Field>
            <Field label="采样率" tip="44100Hz = CD 音质；48000Hz = 视频标准">
              <select
                className="input"
                disabled={disabled}
                value={audio.sampleRate ?? 0}
                onChange={(e) => setAudio({ sampleRate: Number(e.target.value) || null })}
              >
                <option value={0}>保持源</option>
                <option value={44100}>44100</option>
                <option value={48000}>48000</option>
              </select>
            </Field>
            <Field label="声道" tip="单声道 (mono) 体积更小；立体声 (stereo) 是标准">
              <select
                className="input"
                disabled={disabled}
                value={audio.channels ?? 0}
                onChange={(e) => setAudio({ channels: Number(e.target.value) || null })}
              >
                <option value={0}>保持源</option>
                <option value={1}>单声道</option>
                <option value={2}>立体声</option>
              </select>
            </Field>
            <Field label={`音量 · ${((audio.volume ?? 1) * 100).toFixed(0)}%`} tip="1.0 = 原始；<1 减弱；>1 增强（可能失真）">
              <input
                type="range"
                min={0}
                max={3}
                step={0.05}
                className="w-full accent-brand-600"
                disabled={disabled}
                value={audio.volume ?? 1}
                onChange={(e) => setAudio({ volume: Number(e.target.value) })}
              />
            </Field>
          </div>
        )}
      </div>

      {/* ---- 容器 ---- */}
      <div className={`rounded-lg border p-3 ${disabled ? "border-accent-400/40 bg-accent-400/5" : "border-ink-100 bg-white"}`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="label">容器格式</span>
          <InfoTip
            title="容器格式"
            text={"MP4：最通用，几乎所有播放器支持\nMOV：Apple 生态友好\nMKV：功能最全，字幕/多音轨支持好，但 Apple 生态一般\nWebM：浏览器友好（VP9/AV1 + Opus）\nGIF：动图（无声、色板受限）"}
          />
        </div>
        <div className="grid grid-cols-5 gap-2">
          {(["mp4", "mov", "mkv", "webm", "gif"] as ContainerFormat[]).map((c) => (
            <button
              key={c}
              disabled={disabled}
              onClick={() => changeContainer(c)}
              className={`btn ${container.format === c ? "bg-brand-600 text-white" : "btn-ghost"} disabled:opacity-50`}
            >
              .{c}
            </button>
          ))}
        </div>
        {(container.format === "mp4" || container.format === "mov") && (
          <label className="mt-3 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-brand-600"
              disabled={disabled}
              checked={container.faststart}
              onChange={(e) => setContainer({ faststart: e.target.checked })}
            />
            <span className="label">Faststart（-movflags +faststart）</span>
            <InfoTip text="将 moov atom 移到文件开头，便于网络流式播放（边下边播）。上传到 YouTube / 网站强烈建议开启。" />
          </label>
        )}
      </div>
    </section>
  );
}
