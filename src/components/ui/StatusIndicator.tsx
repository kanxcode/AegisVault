import { cn } from "@/lib/utils";

export type IndicatorTone = 'online' | 'offline' | 'degraded' | 'executing' | 'idle';

interface StatusIndicatorProps {
  tone: IndicatorTone;
  label: string;
  detail?: string;
  pulse?: boolean;
  className?: string;
}

const toneMap: Record<IndicatorTone, { dot: string; text: string; border: string; bg: string }> = {
  online: {
    dot: "bg-[#3ECF72]",
    text: "text-[#4ADE80]",
    border: "border-[#265438]",
    bg: "bg-[#12271B]/70",
  },
  executing: {
    dot: "bg-[#38BDF8]",
    text: "text-[#38BDF8]",
    border: "border-[#1E4B63]",
    bg: "bg-[#0F2430]/70",
  },
  degraded: {
    dot: "bg-[#F59E0B]",
    text: "text-[#F59E0B]",
    border: "border-[#594019]",
    bg: "bg-[#281E0E]/70",
  },
  offline: {
    dot: "bg-[#EF4444]",
    text: "text-[#F87171]",
    border: "border-[#5B2329]",
    bg: "bg-[#2A1215]/70",
  },
  idle: {
    dot: "bg-[#53616E]",
    text: "text-[#8B98A5]",
    border: "border-[#25303A]",
    bg: "bg-[#11161B]/70",
  },
};

export function StatusIndicator({
  tone,
  label,
  detail,
  pulse = false,
  className,
}: StatusIndicatorProps) {
  const styles = toneMap[tone];
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 border rounded-[2px] font-mono text-[10px] tracking-wider uppercase",
        styles.bg,
        styles.border,
        styles.text,
        className
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", styles.dot, pulse && "animate-pulse")} />
      <span className="font-semibold">{label}</span>
      {detail && <span className="text-[#8B98A5] font-normal">· {detail}</span>}
    </div>
  );
}

