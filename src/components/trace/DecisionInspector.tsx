import { useState } from "react";
import type { TraceEvent } from "@/types/trace";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import {
  HelpCircle,
  Calculator,
  MapPin,
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Sliders,
  CheckCircle2,
  GitCommit,
} from "lucide-react";

interface DecisionInspectorProps {
  event: TraceEvent | null;
  stepNumber: number;
  totalSteps: number;
  className?: string;
}

export function DecisionInspector({
  event,
  stepNumber,
  totalSteps,
  className = "",
}: DecisionInspectorProps) {
  const [showStateDetails, setShowStateDetails] = useState(false);

  if (!event) {
    return (
      <div
        className={`bg-[#0C1013] border border-[#1C252C] rounded-[2px] p-5 text-center font-mono text-xs text-[#53616E] ${className}`}
      >
        STANDBY // NO EXECUTION DECISION SELECTED FOR INSPECTION
      </div>
    );
  }

  const getStatusVariant = (status: string): BadgeVariant => {
    switch (status?.toUpperCase()) {
      case "SUCCESS":
        return "green";
      case "FAULT":
        return "amber";
      case "REJECTED":
      case "ABORTED":
      case "ERROR":
        return "red";
      default:
        return "gray";
    }
  };

  const renderCalculationDetails = (calc: Record<string, any>) => {
    if (!calc || Object.keys(calc).length === 0) {
      return (
        <span className="text-[#53616E] italic text-[11px]">
          No mathematical calculations emitted for this step.
        </span>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono">
        {Object.entries(calc).map(([key, value]) => {
          const displayKey = key.replace(/_/g, " ").toUpperCase();
          const isComplex = typeof value === "object" && value !== null;

          return (
            <div
              key={key}
              className={`p-2 rounded-[2px] bg-[#080B0D] border border-[#1C252C] flex flex-col gap-0.5 ${
                key.toLowerCase().includes("competitor") ||
                key.toLowerCase().includes("rejected")
                  ? "md:col-span-2 border-[#594019]"
                  : ""
              }`}
            >
              <span className="text-[10px] text-[#53616E] font-semibold">
                {displayKey}
              </span>
              {isComplex ? (
                <pre className="text-[10px] text-[#F59E0B] bg-[#050708] p-1.5 rounded-[2px] overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(value, null, 2)}
                </pre>
              ) : (
                <span className="text-[#4ADE80] font-medium break-all">
                  {String(value)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderStateObject = (
    obj: Record<string, any>,
    label: string,
    color: string
  ) => {
    if (!obj || Object.keys(obj).length === 0) {
      return (
        <div className="text-[10px] text-[#53616E] italic p-2 bg-[#050708] rounded-[2px] border border-[#1C252C]">
          No recorded state diff.
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[10px] font-mono text-[#8B98A5] uppercase">
          <span style={{ color }}>{label}</span>
          <span>{Object.keys(obj).length} keys</span>
        </div>
        <div className="bg-[#050708] border border-[#1C252C] rounded-[2px] p-2 max-h-48 overflow-y-auto custom-scrollbar font-mono text-[10px] text-[#8B98A5] space-y-1">
          {Object.entries(obj).map(([k, v]) => (
            <div
              key={k}
              className="flex flex-col border-b border-[#141B21] pb-0.5 last:border-none"
            >
              <span className="text-[#53616E] font-semibold">{k}:</span>
              <span className="text-[#E6EDF3] pl-2 break-all">
                {typeof v === "object" && v !== null
                  ? JSON.stringify(v)
                  : String(v)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`bg-[#0C1013] border border-[#1C252C] rounded-[2px] flex flex-col overflow-hidden ${className}`}
    >
      <div className="px-3.5 py-2.5 bg-[#080B0D] border-b border-[#1C252C] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-[#3ECF72]" />
          <h3 className="font-mono text-xs font-semibold tracking-wider text-[#C5D1DC] uppercase">
            DECISION INSPECTOR // EXPLAINABILITY ENGINE
          </h3>
          <Badge variant={getStatusVariant(event.status)}>{event.status}</Badge>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px] text-[#8B98A5] tabular-nums">
          <span>
            STEP {stepNumber || event.step_number} OF {totalSteps}
          </span>
          <span className="text-[#2A3844]">|</span>
          <span className="text-[#4ADE80]">{event.simulation_time} ms</span>
        </div>
      </div>

      <div className="p-3.5 space-y-3 font-mono">
        <div className="bg-[#080B0D] border border-[#1C252C] rounded-[2px] p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] text-[#8B98A5] font-bold uppercase mb-1">
            <CheckCircle2 className="w-3 h-3 text-[#4ADE80]" />
            <span>WHAT HAPPENED</span>
            <span className="text-[#53616E]">[{event.operation}]</span>
          </div>
          <div className="text-xs text-[#E6EDF3] font-medium leading-relaxed">
            {event.reason || event.action}
          </div>
          {event.action && event.action !== event.reason && (
            <div className="text-[11px] text-[#8B98A5] mt-0.5">
              Action executed: <span className="text-[#F59E0B]">{event.action}</span>
            </div>
          )}
        </div>

        <div className="bg-[#080B0D] border border-[#1C252C] rounded-[2px] p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] text-[#F59E0B] font-bold uppercase mb-1">
            <HelpCircle className="w-3 h-3 text-[#F59E0B]" />
            <span>WHY IT HAPPENED (ALGORITHM RULE &amp; REASONING)</span>
          </div>
          <p className="text-xs text-[#C5D1DC] leading-relaxed">
            {event.explanation}
          </p>
        </div>

        <div className="bg-[#080B0D] border border-[#1C252C] rounded-[2px] p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] text-[#38BDF8] font-bold uppercase mb-2">
            <Calculator className="w-3 h-3 text-[#38BDF8]" />
            <span>HOW IT WAS CALCULATED</span>
          </div>
          {renderCalculationDetails(event.calculation)}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="bg-[#080B0D] border border-[#1C252C] rounded-[2px] p-2.5">
            <div className="flex items-center gap-1 text-[10px] text-[#53616E] font-bold uppercase mb-1">
              <MapPin className="w-3 h-3 text-[#4ADE80]" />
              <span>WHERE IT HAPPENED</span>
            </div>
            <div className="text-[11px] text-[#E6EDF3]">
              Target:{" "}
              <span className="text-[#4ADE80] font-bold">
                {event.entity || "SYSTEM"}
              </span>
            </div>
            {event.affected_entities && event.affected_entities.length > 0 && (
              <div className="text-[10px] text-[#8B98A5] mt-0.5 truncate">
                Affected: {event.affected_entities.join(", ")}
              </div>
            )}
          </div>

          <div className="bg-[#080B0D] border border-[#1C252C] rounded-[2px] p-2.5">
            <div className="flex items-center gap-1 text-[10px] text-[#53616E] font-bold uppercase mb-1">
              <Clock className="w-3 h-3 text-[#F59E0B]" />
              <span>WHEN IT HAPPENED</span>
            </div>
            <div className="text-[11px] text-[#E6EDF3]">
              Simulation Time:{" "}
              <span className="text-[#F59E0B] font-bold">
                {event.simulation_time} ms
              </span>
            </div>
            <div className="text-[10px] text-[#8B98A5] mt-0.5">
              Sequence Index: Step #{event.step_number} of {totalSteps}
            </div>
          </div>
        </div>

        {event.next_step && (
          <div className="bg-[#080B0D] border border-[#1C252C] rounded-[2px] p-2.5 flex items-start gap-2">
            <ArrowRight className="w-3.5 h-3.5 text-[#3ECF72] mt-0.5 shrink-0" />
            <div className="text-xs">
              <span className="text-[10px] text-[#53616E] font-bold uppercase block">
                NEXT STEP
              </span>
              <span className="text-[#C5D1DC]">{event.next_step}</span>
            </div>
          </div>
        )}

        <div className="border border-[#1C252C] rounded-[2px] overflow-hidden">
          <button
            onClick={() => setShowStateDetails(!showStateDetails)}
            className="w-full px-3 py-2 bg-[#080B0D] hover:bg-[#11161B] flex items-center justify-between text-[11px] font-mono text-[#8B98A5] hover:text-[#E6EDF3] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <GitCommit className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span className="font-semibold uppercase">
                STATE BEFORE &amp; AFTER TRANSITION DIFF
              </span>
            </div>
            {showStateDetails ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>

          {showStateDetails && (
            <div className="p-3 bg-[#050708] grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-[#1C252C]">
              {renderStateObject(
                event.state_before,
                "STATE BEFORE OPERATION",
                "#F59E0B"
              )}
              {renderStateObject(
                event.state_after,
                "STATE AFTER OPERATION",
                "#4ADE80"
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
