import { cn } from "@/lib/utils";
import { Badge, type BadgeVariant } from "./Badge";

interface MetricDisplayProps {
  label: string;
  value: string | number;
  unit?: string;
  status?: string;
  variant?: BadgeVariant;
  sublabel?: string;
  progress?: number; // 0..100
  accent?: 'green' | 'cyan' | 'amber' | 'red' | 'neutral';
  unavailable?: boolean;
  className?: string;
}

const accentText: Record<NonNullable<MetricDisplayProps['accent']>, string> = {
  green: "text-[#4ADE80]",
  cyan: "text-[#38BDF8]",
  amber: "text-[#F59E0B]",
  red: "text-[#F87171]",
  neutral: "text-[#E6EDF3]",
};

const accentBar: Record<NonNullable<MetricDisplayProps['accent']>, string> = {
  green: "bg-[#3ECF72]",
  cyan: "bg-[#38BDF8]",
  amber: "bg-[#F59E0B]",
  red: "bg-[#EF4444]",
  neutral: "bg-[#8B98A5]",
};

export function MetricDisplay({
  label,
  value,
  unit,
  status,
  variant = 'gray',
  sublabel,
  progress,
  accent = 'neutral',
  unavailable = false,
  className,
}: MetricDisplayProps) {
  return (
    <div
      className={cn(
        "bg-[#0C1013] border border-[#1C252C] rounded-[2px] p-3.5 flex flex-col justify-between gap-2 relative overflow-hidden",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold tracking-[0.12em] text-[#53616E] uppercase truncate">
          {label}
        </span>
        {status && (
          <Badge variant={unavailable ? 'gray' : variant} className="text-[9px] px-1.5 py-0">
            {unavailable ? 'UNAVAILABLE' : status}
          </Badge>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className={cn("font-mono text-2xl font-bold tracking-tight tabular-nums", unavailable ? "text-[#53616E]" : accentText[accent])}>
          {unavailable ? "N/A" : value}
          {!unavailable && unit && (
            <span className="text-xs font-normal text-[#8B98A5] ml-1">{unit}</span>
          )}
        </div>
      </div>

      {progress !== undefined && (
        <div className="h-1 w-full bg-[#11161B] rounded-[1px] overflow-hidden">
          <div
            className={cn("h-full transition-all duration-300", unavailable ? "bg-[#25303A]" : accentBar[accent])}
            style={{ width: `${unavailable ? 0 : Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}

      {sublabel && (
        <div className="font-mono text-[10px] text-[#8B98A5] truncate">
          {sublabel}
        </div>
      )}
    </div>
  );
}

