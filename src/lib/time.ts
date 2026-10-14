// 时间 & 数字格式化工具

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || Number.isNaN(sec) || !Number.isFinite(sec)) return "--:--";
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const ss = Math.floor(rest);
  const cs = Math.floor((rest - ss) * 100);
  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${ss
      .toString()
      .padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}.${cs
    .toString()
    .padStart(2, "0")}`;
}

export function formatSize(mb: number | null | undefined): string {
  if (mb == null || Number.isNaN(mb)) return "—";
  if (mb < 1) return `${(mb * 1024).toFixed(0)} KB`;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function formatBitrate(kbps: number | null | undefined): string {
  if (kbps == null || Number.isNaN(kbps)) return "—";
  if (kbps < 1000) return `${kbps.toFixed(0)} kbps`;
  return `${(kbps / 1000).toFixed(2)} Mbps`;
}

/** 把 "00:01:23.500" / "83.5" / 数字 都能解析成秒 */
export function parseTimeInput(v: string | number): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = v.trim();
  if (!s) return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  // HH:MM:SS.ms 或 MM:SS.ms
  const parts = s.split(":");
  if (parts.length > 3) return null;
  let sec = 0;
  for (const p of parts) {
    const n = parseFloat(p);
    if (!Number.isFinite(n)) return null;
    sec = sec * 60 + n;
  }
  return sec;
}

export function basename(path: string): string {
  if (!path) return "";
  const norm = path.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  return idx === -1 ? norm : norm.slice(idx + 1);
}

export function dirname(path: string): string {
  if (!path) return "";
  const norm = path.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  return idx === -1 ? "" : norm.slice(0, idx);
}

export function extname(path: string): string {
  const b = basename(path);
  const i = b.lastIndexOf(".");
  return i === -1 ? "" : b.slice(i + 1).toLowerCase();
}

export function withExtension(path: string, ext: string): string {
  const dir = dirname(path);
  const b = basename(path);
  const dot = b.lastIndexOf(".");
  const stem = dot === -1 ? b : b.slice(0, dot);
  const cleanExt = ext.replace(/^\./, "");
  const out = `${stem}.${cleanExt}`;
  return dir ? `${dir}/${out}` : out;
}

export function uid(prefix = "task"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
