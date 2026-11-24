import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoadingState({
  label = "SYNCHRONIZING TELEMETRY...",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-center gap-2.5 py-10 font-mono text-xs text-[#8B98A5]", className)}>
      <RefreshCw className="w-4 h-4 animate-spin text-[#3ECF72]" />
      <span className="tracking-wider uppercase">{label}</span>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "p-3.5 bg-[#2A1215]/60 border border-[#5B2329] rounded-[2px] flex items-center justify-between gap-3 font-mono text-xs text-[#F87171]",
        className
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="truncate">{message}</span>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-2.5 py-1 bg-[#11161B] hover:bg-[#171E24] border border-[#5B2329] text-[#F87171] text-[10px] font-bold rounded-[2px] shrink-0 cursor-pointer"
        >
          RETRY
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title = "NO DATA RECORDED",
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "py-10 px-4 flex flex-col items-center justify-center text-center gap-2 border border-dashed border-[#1C252C] bg-[#080B0D]/60 rounded-[2px]",
        className
      )}
    >
      <Inbox className="w-5 h-5 text-[#53616E]" />
      <div className="font-mono text-xs font-semibold tracking-wider text-[#8B98A5] uppercase">
        {title}
      </div>
      {description && (
        <p className="font-mono text-[11px] text-[#53616E] max-w-md">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

