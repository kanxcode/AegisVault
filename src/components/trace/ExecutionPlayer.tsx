import { useEffect } from "react";
import type { ChangeEvent } from "react";
import { Play, Pause, RotateCcw, ChevronLeft, ChevronRight, Activity } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { TraceEvent } from "@/types/trace";

interface ExecutionPlayerProps {
  traceEvents: TraceEvent[];
  currentStep: number;
  onStepChange: (step: number | ((prev: number) => number)) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  speed: number;
  setSpeed: (speed: number) => void;
  simulationTime?: number;
  moduleName?: string;
  className?: string;
}

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4];

export function ExecutionPlayer({
  traceEvents,
  currentStep,
  onStepChange,
  isPlaying,
  setIsPlaying,
  speed,
  setSpeed,
  simulationTime,
  moduleName,
  className = "",
}: ExecutionPlayerProps) {
  const totalSteps = traceEvents.length;
  const currentEvent = traceEvents[currentStep] || traceEvents[0];
  const currentTime =
    simulationTime !== undefined
      ? simulationTime
      : (currentEvent?.simulation_time ?? 0);

  useEffect(() => {
    if (!isPlaying || totalSteps === 0) return;

    const intervalMs = Math.max(150, Math.floor(1000 / speed));
    const timer = setInterval(() => {
      onStepChange((prev) => {
        if (prev >= totalSteps - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, speed, totalSteps, onStepChange, setIsPlaying]);

  const handlePlayToggle = () => {
    if (totalSteps === 0) return;
    if (currentStep >= totalSteps - 1) {
      onStepChange(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const handleStepBack = () => {
    setIsPlaying(false);
    onStepChange((prev) => Math.max(0, prev - 1));
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    onStepChange((prev) => Math.min(totalSteps - 1, prev + 1));
  };

  const handleRestart = () => {
    setIsPlaying(false);
    onStepChange(0);
  };

  const handleSliderChange = (e: ChangeEvent<HTMLInputElement>) => {
    setIsPlaying(false);
    onStepChange(Number(e.target.value));
  };

  if (totalSteps === 0) {
    return (
      <div
        className={`bg-[#080B0D] border border-[#1C252C] p-3 rounded-[2px] flex items-center justify-between text-xs text-[#53616E] font-mono ${className}`}
      >
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-[#53616E]" />
          <span>STANDBY: NO ACTIVE SIMULATION TRACE LOADED</span>
        </div>
        <span className="text-[10px] tracking-widest uppercase">TRACE ENGINE READY</span>
      </div>
    );
  }

  const isCompleted = currentStep >= totalSteps - 1;

  return (
    <div
      className={`bg-[#080B0D] border border-[#1C252C] p-3.5 rounded-[2px] flex flex-col gap-2.5 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#141B21] pb-2">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isPlaying
                ? "bg-[#3ECF72] animate-pulse"
                : isCompleted
                ? "bg-[#38BDF8]"
                : "bg-[#F59E0B]"
            }`}
          />
          <span className="font-mono text-[11px] font-semibold tracking-wider text-[#C5D1DC] uppercase">
            {moduleName ? `${moduleName} TRACE` : "EXECUTION TRACE"}
          </span>
          <Badge variant={isCompleted ? "cyan" : isPlaying ? "green" : "amber"}>
            {isCompleted ? "COMPLETED" : isPlaying ? "PLAYING" : "PAUSED"}
          </Badge>
          {currentEvent?.operation && (
            <span className="hidden sm:inline font-mono text-[10px] text-[#8B98A5] bg-[#0C1013] px-2 py-0.5 rounded-[2px] border border-[#1C252C]">
              OP: {currentEvent.operation.toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
          <div className="text-[#8B98A5] flex items-center gap-1">
            <span>STEP</span>
            <span className="text-[#E6EDF3] font-bold">{currentStep + 1}</span>
            <span className="text-[#53616E]">/</span>
            <span>{totalSteps}</span>
          </div>
          <div className="text-[#8B98A5] flex items-center gap-1 pl-2.5 border-l border-[#1C252C]">
            <span>T=</span>
            <span className="text-[#4ADE80] font-bold">{currentTime}</span>
            <span className="text-[10px] text-[#53616E]">ms</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={totalSteps - 1}
          value={currentStep}
          onChange={handleSliderChange}
          className="w-full h-1.5 bg-[#11161B] rounded-[2px] appearance-none cursor-pointer accent-[#3ECF72]"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleRestart}
            title="Restart to Beginning"
            className="p-1.5 bg-[#0C1013] hover:bg-[#171E24] border border-[#1C252C] hover:border-[#2A3844] text-[#8B98A5] hover:text-[#E6EDF3] rounded-[2px] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleStepBack}
            disabled={currentStep === 0}
            title="Step Backward"
            className="p-1.5 bg-[#0C1013] hover:bg-[#171E24] disabled:opacity-40 disabled:cursor-not-allowed border border-[#1C252C] hover:border-[#2A3844] text-[#8B98A5] hover:text-[#E6EDF3] rounded-[2px] transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handlePlayToggle}
            title={isPlaying ? "Pause Simulation" : "Run / Resume Simulation"}
            className={`flex items-center gap-1.5 px-3 py-1 font-mono text-xs font-semibold rounded-[2px] border transition-colors cursor-pointer ${
              isPlaying
                ? "bg-[#281E0E] border-[#594019] text-[#F59E0B] hover:bg-[#35250E]"
                : "bg-[#12271B] border-[#265438] text-[#4ADE80] hover:bg-[#183525]"
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>PAUSE</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isCompleted ? "REPLAY" : "RUN"}</span>
              </>
            )}
          </button>

          <button
            onClick={handleStepForward}
            disabled={currentStep >= totalSteps - 1}
            title="Step Forward"
            className="p-1.5 bg-[#0C1013] hover:bg-[#171E24] disabled:opacity-40 disabled:cursor-not-allowed border border-[#1C252C] hover:border-[#2A3844] text-[#8B98A5] hover:text-[#E6EDF3] rounded-[2px] transition-colors cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1 bg-[#0C1013] p-0.5 rounded-[2px] border border-[#1C252C]">
          <span className="font-mono text-[9px] text-[#53616E] px-1.5 uppercase hidden sm:inline">
            RATE:
          </span>
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`font-mono text-[10px] px-1.5 py-0.5 rounded-[2px] transition-colors cursor-pointer ${
                speed === s
                  ? "bg-[#12271B] text-[#4ADE80] border border-[#265438] font-bold"
                  : "text-[#53616E] hover:text-[#E6EDF3]"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
