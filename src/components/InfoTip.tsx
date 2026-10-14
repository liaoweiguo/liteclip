import React from "react";

interface InfoTipProps {
  /** 提示正文，支持简单换行 */
  text: string;
  /** 标题（可选） */
  title?: string;
  className?: string;
}

/**
 * 通用「?」图标提示 —— 悬停/聚焦时展示详细参数说明。
 * 采用纯 CSS + JS 状态，无需第三方库。
 */
export default function InfoTip({ text, title, className = "" }: InfoTipProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
    >
      <span
        aria-label="参数说明"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full
                   bg-ink-100 text-[10px] font-semibold text-ink-500 cursor-help
                   hover:bg-brand-100 hover:text-brand-700 transition-colors"
      >
        ?
      </span>
      {open && (
        <span
          role="tooltip"
          className="tooltip left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-pre-line anim-fade-in"
        >
          {title && (
            <span className="block mb-1 font-semibold text-white/90">{title}</span>
          )}
          {text}
        </span>
      )}
    </span>
  );
}
