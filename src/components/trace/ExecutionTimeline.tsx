import { useRef, useEffect } from "react";
import type { TraceEvent } from "@/types/trace";
import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";

interface ExecutionTimelineProps {
  traceEvents: TraceEvent[];
  currentStep: number;
  onSelectStep: (stepIndex: number) => void;
  className?: string;
}

export function ExecutionTimeline({
  traceEvents,
  currentStep,
  onSelectStep,
  className = "",
}: ExecutionTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeItemRef.current && containerRef.current) {
      activeItemRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [currentStep]);

  if (traceEvents.length === 0) {
    return null;
  }

  const getStatusIcon = (status: string) => {
    switch (status?.toUpperCase()) {
      case "SUCCESS":
        return <CheckCircle2 className="w-2.5 h-2.5 text-[#4ADE80]" />;
      case "FAULT":
        return <AlertCircle className="w-2.5 h-2.5 text-[#F59E0B]" />;
      case "REJECTED":
      case "ABORTED":
      case "ERROR":
        return <XCircle className="w-2.5 h-2.5 text-[#F87171]" />;
      default:
        return null;
    }
  };

  return (
    <div className={`bg-[#080B0D] border border-[#1C252C] rounded-[2px] p-2.5 flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between px-1 text-[10px] font-mono text-[#8B98A5] uppercase border-b border-[#141B21] pb-1.5">
        <span className="tracking-wider">TIMELINE SEQUENCE ({traceEvents.length} STEPS)</span>
        <span className="text-[#53616E]">SELECT STEP TO INSPECT RATIONALE</span>
      </div>

      <div
        ref={containerRef}
        className="flex items-center gap-1.5 overflow-x-auto py-1 custom-scrollbar"
      >
        {traceEvents.map((event, idx) => {
          const isActive = idx === currentStep;
          const isPassed = idx < currentStep;

          return (
            <button
              key={event.id || `${event.execution_id}-${event.step_number}-${idx}`}
              ref={isActive ? activeItemRef : null}
              onClick={() => onSelectStep(idx)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-[2px] font-mono text-left border transition-all cursor-pointer ${
                isActive
                  ? "bg-[#12271B] border-[#3ECF72] text-[#E6EDF3]"
                  : isPassed
                  ? "bg-[#0C1013] border-[#1C252C] text-[#8B98A5] hover:border-[#2A3844] hover:text-[#E6EDF3]"
                  : "bg-[#050708] border-[#141B21] text-[#53616E] hover:border-[#1C252C] hover:text-[#8B98A5]"
              }`}
            >
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <span className={`text-[10px] font-bold ${isActive ? "text-[#4ADE80]" : "text-[#8B98A5]"}`}>
                    #{event.step_number}
                  </span>
                  {getStatusIcon(event.status)}
                  <span className="text-[9px] text-[#53616E]">{event.simulation_time}ms</span>
                </div>
                <div className="flex items-center gap-1 max-w-[125px] truncate">
                  <span className="text-[10px] truncate font-medium text-[#E6EDF3]">
                    {event.operation}
                  </span>
                </div>
                {event.entity && (
                  <span className="text-[9px] text-[#38BDF8] font-semibold truncate">
                    [{event.entity}]
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
