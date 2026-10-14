import React from "react";
import InfoTip from "./InfoTip";

interface FieldProps {
  label: string;
  tip?: string;
  tipTitle?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** 右侧附加内容（如单位、开关） */
  suffix?: React.ReactNode;
}

/**
 * 统一的表单字段外观：左侧标签 + 「?」提示，右侧控件，下方灰色 hint。
 */
export default function Field({
  label, tip, tipTitle, hint, children, className = "", suffix,
}: FieldProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-1.5">
        <span className="label">{label}</span>
        {tip && <InfoTip text={tip} title={tipTitle} />}
        {suffix && <span className="ml-auto">{suffix}</span>}
      </div>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
