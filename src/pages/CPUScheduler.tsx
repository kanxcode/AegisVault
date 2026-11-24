import { useState, useEffect, useRef } from "react";
import { animate, stagger } from "animejs";
import { shouldReduceMotion } from "@/lib/motion";
import {
  Panel,
  MetricDisplay,
  StatusIndicator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ErrorState,
} from "@/components/ui";
import { Play, RotateCcw, Plus, Trash2, Cpu, BarChart3 } from "lucide-react";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";
import {
  ExecutionPlayer,
  ExecutionTimeline,
  DecisionInspector,
  AlgorithmComparison,
} from "@/components/trace";
import type { TraceEvent } from "@/types/trace";

interface SchedulerProcess {
  pid: string;
  arrivalTime: number;
  burstTime: number;
  priority: number;
}

const LANE_PALETTE = [
  { bg: "bg-[#3ECF72]", border: "border-[#4ADE80]", text: "text-[#050708]", hex: "#3ECF72" },
  { bg: "bg-[#38BDF8]", border: "border-[#7DD3FC]", text: "text-[#050708]", hex: "#38BDF8" },
  { bg: "bg-[#F59E0B]", border: "border-[#FBBF24]", text: "text-[#050708]", hex: "#F59E0B" },
  { bg: "bg-[#2DD4BF]", border: "border-[#5EEAD4]", text: "text-[#050708]", hex: "#2DD4BF" },
  { bg: "bg-[#FB7185]", border: "border-[#FDA4AF]", text: "text-[#050708]", hex: "#FB7185" },
  { bg: "bg-[#A3E635]", border: "border-[#BEF264]", text: "text-[#050708]", hex: "#A3E635" },
  { bg: "bg-[#94A3B8]", border: "border-[#CBD5E1]", text: "text-[#050708]", hex: "#94A3B8" },
];

export default function CPUScheduler() {
  const [algorithm, setAlgorithm] = useState("ROUND_ROBIN");
  const [quantum, setQuantum] = useState(4);
  const [isRunning, setIsRunning] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [showComparison, setShowComparison] = useState<boolean>(false);

  const {
    processes: storeProcesses,
    fetchProcesses,
    addEvent,
    setActiveExecution,
    setExecutingSimulation,
    pushNotification,
  } = useStore();
  const [schedulerQueue, setSchedulerQueue] = useState<SchedulerProcess[]>([]);

  const [customPid, setCustomPid] = useState("");
  const [customArrival, setCustomArrival] = useState(0);
  const [customBurst, setCustomBurst] = useState(25);
  const [customPriority, setCustomPriority] = useState(1);
  const [showAddForm, setShowAddForm] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const loadHistory = async () => {
    try {
      const data = await api.getSchedulingHistory();
      if (Array.isArray(data)) setHistory(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchProcesses();
    loadHistory();
  }, [fetchProcesses]);

  useEffect(() => {
    if (storeProcesses.length > 0 && schedulerQueue.length === 0) {
      setSchedulerQueue(
        storeProcesses.slice(0, 5).map((p) => ({
          pid: p.pid,
          arrivalTime: p.arrivalTime,
          burstTime: p.burstTime,
          priority: p.priority,
        }))
      );
    }
  }, [storeProcesses, schedulerQueue.length]);

  const getPidColor = (pid: string) => {
    const idx = schedulerQueue.findIndex((p) => p.pid === pid);
    return LANE_PALETTE[(idx >= 0 ? idx : pid.charCodeAt(pid.length - 1)) % LANE_PALETTE.length];
  };

  const handleRun = async () => {
    if (schedulerQueue.length === 0) {
      setErrorMsg("Queue is empty. Add processes to simulate.");
      return;
    }
    setErrorMsg(null);
    setIsRunning(true);
    setExecutingSimulation(true);
    setIsPlaying(false);

    try {
      const data = await api.runScheduler({
        algorithm,
        quantum: algorithm === "ROUND_ROBIN" ? Number(quantum) : undefined,
        processes: schedulerQueue.map((p) => ({
          pid: p.pid,
          arrival_time: Number(p.arrivalTime),
          burst_time: Number(p.burstTime),
          priority: Number(p.priority),
        })),
      });

      setSimulationResult(data);
      const events: TraceEvent[] = data.trace_events || [];
      setTraceEvents(events);
      setCurrentStep(0);
      loadHistory();

      if (data.execution_id) {
        setActiveExecution({
          execution_id: data.execution_id,
          module: "cpu_scheduler",
          algorithm,
          status: "COMPLETED",
          total_steps: events.length,
        });
      }

      pushNotification({
        title: "CPU SCHEDULER COMPLETE",
        message: `${algorithm} executed across ${events.length} trace steps (Avg Wait: ${data.average_waiting_time?.toFixed(2)}ms)`,
        severity: "SUCCESS",
        module: "CPU",
        execution_id: data.execution_id,
      });

      addEvent({
        module: "CPU",
        event: "SCHEDULER_EXEC",
        severity: "INFO",
        description: `Executed ${algorithm} scheduling with ${events.length} observable trace steps.`,
      });
    } catch (error: any) {
      setErrorMsg(error.message || "Simulation execution failed");
    } finally {
      setIsRunning(false);
      setExecutingSimulation(false);
    }
  };

  const handleAddProcess = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPid.trim()) return;
    setSchedulerQueue((prev) => [
      ...prev,
      {
        pid: customPid.trim().toUpperCase(),
        arrivalTime: Number(customArrival),
        burstTime: Number(customBurst),
        priority: Number(customPriority),
      },
    ]);
    setCustomPid("");
    setShowAddForm(false);
  };

  const handleRemove = (pid: string) => {
    setSchedulerQueue((prev) => prev.filter((p) => p.pid !== pid));
  };

  const handleResetQueue = () => {
    setSchedulerQueue(
      storeProcesses.slice(0, 5).map((p) => ({
        pid: p.pid,
        arrivalTime: p.arrivalTime,
        burstTime: p.burstTime,
        priority: p.priority,
      }))
    );
    setSimulationResult(null);
    setTraceEvents([]);
    setCurrentStep(0);
    setIsPlaying(false);
    setErrorMsg(null);
  };

  const currentEvent = traceEvents[currentStep] || null;
  const currentSimTime = currentEvent ? currentEvent.simulation_time : 0;
  const allGanttBlocks = simulationResult?.gantt || [];
  const totalSimTime = allGanttBlocks.length > 0 ? allGanttBlocks[allGanttBlocks.length - 1].end : 20;

  const visibleGanttBlocks =
    traceEvents.length > 0
      ? allGanttBlocks.filter((b: any) => b.start <= currentSimTime)
      : allGanttBlocks;

  const pointInTimeReadyQueue: string[] =
    currentEvent?.state_after?.ready_queue ||
    currentEvent?.state_before?.ready_queue ||
    [];

  const pointInTimeRunningPid: string | null =
    currentEvent?.state_after?.running ??
    currentEvent?.state_after?.running_process ??
    (currentEvent?.entity && currentEvent.entity !== "SYSTEM" && currentEvent.entity !== "CPU"
      ? currentEvent.entity
      : null);

  const ganttRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!simulationResult || shouldReduceMotion() || !ganttRef.current) return;
    const blocks = ganttRef.current.querySelectorAll(".gantt-seg");
    if (blocks.length === 0) return;
    const anim = animate(blocks, {
      opacity: [0.25, 1],
      scaleX: [0.85, 1],
      delay: stagger(35),
      duration: 280,
      ease: "outCubic",
    });
    return () => {
      anim.pause();
    };
  }, [simulationResult]);

  return (
    <div className="flex flex-col gap-4 max-w-[1440px] mx-auto pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1C252C] pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#12271B] border border-[#265438] text-[#4ADE80] rounded-[2px]">
              CPU-02
            </span>
            <Cpu className="w-4 h-4 text-[#3ECF72]" />
            <h1 className="font-display text-xl font-bold tracking-[0.08em] text-[#E6EDF3] uppercase">
              CPU Scheduler &amp; Execution Lanes
            </h1>
          </div>
          <p className="font-mono text-[10px] text-[#8B98A5] tracking-widest uppercase">
            Synchronized Gantt Timeline • Ready Queue State • Deterministic Decision Trace
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <StatusIndicator
            tone={pointInTimeRunningPid ? "executing" : "idle"}
            label={pointInTimeRunningPid ? `CPU CORE: ${pointInTimeRunningPid}` : "CPU CORE: IDLE"}
            pulse={Boolean(pointInTimeRunningPid && isPlaying)}
          />
          <button
            onClick={() => setShowComparison(!showComparison)}
            className={`h-8 px-3 font-mono text-xs font-semibold rounded-[2px] border flex items-center gap-1.5 transition-colors cursor-pointer ${
              showComparison
                ? "bg-[#281E0E] border-[#594019] text-[#F59E0B]"
                : "bg-[#0C1013] hover:bg-[#171E24] border-[#1C252C] text-[#8B98A5] hover:text-[#E6EDF3]"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span>{showComparison ? "HIDE BENCHMARK" : "INLINE BENCHMARK"}</span>
          </button>
        </div>
      </div>

      {errorMsg && <ErrorState message={errorMsg} />}

      {showComparison && (
        <AlgorithmComparison
          moduleType="cpu"
          defaultPayload={{
            processes: schedulerQueue.map((p) => ({
              pid: p.pid,
              arrival_time: Number(p.arrivalTime),
              burst_time: Number(p.burstTime),
              priority: Number(p.priority),
            })),
            quantum: Number(quantum),
          }}
          onApplyAlgorithm={(algo) => {
            setAlgorithm(algo);
            setShowComparison(false);
          }}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Controls */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <Panel title="Scheduler Parameters" code="CFG">
            <div className="flex flex-col gap-3.5 font-mono">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[#8B98A5] tracking-widest uppercase">POLICY</label>
                <select
                  className="h-8 bg-[#080B0D] border border-[#1C252C] rounded-[2px] px-2.5 text-xs text-[#E6EDF3] focus:outline-none focus:border-[#3ECF72] cursor-pointer"
                  value={algorithm}
                  onChange={(e) => setAlgorithm(e.target.value)}
                >
                  <option value="FCFS">FIRST COME FIRST SERVE (FCFS)</option>
                  <option value="SJF">SHORTEST JOB FIRST (SJF)</option>
                  <option value="ROUND_ROBIN">ROUND ROBIN (RR)</option>
                  <option value="PRIORITY">NON-PREEMPTIVE PRIORITY</option>
                </select>
              </div>

              {algorithm === "ROUND_ROBIN" && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[#8B98A5] tracking-widest uppercase">
                    TIME QUANTUM (ms)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={quantum}
                    onChange={(e) => setQuantum(Number(e.target.value))}
                    className="h-8 bg-[#080B0D] border border-[#1C252C] rounded-[2px] px-2.5 text-xs text-[#E6EDF3] focus:outline-none focus:border-[#3ECF72]"
                  />
                </div>
              )}

              {algorithm === "PRIORITY" && (
                <div className="p-2.5 bg-[#281E0E]/40 border border-[#594019] rounded-[2px] text-[10px] text-[#F59E0B]">
                  CONVENTION: Lower integer indicates higher dispatch priority (0 = highest).
                </div>
              )}

              <button
                onClick={handleRun}
                disabled={isRunning || schedulerQueue.length === 0}
                className="h-9 bg-[#12271B] hover:bg-[#183525] border border-[#265438] disabled:opacity-40 text-[#4ADE80] text-xs font-bold rounded-[2px] flex items-center justify-center gap-2 transition-colors uppercase tracking-widest cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isRunning ? "COMPUTING TRACE..." : "EXECUTE SCHEDULER"}</span>
              </button>
            </div>
          </Panel>

          <Panel
            title="Workload Queue"
            code="WL"
            actions={
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    setCustomPid(`P${schedulerQueue.length + 101}`);
                    setShowAddForm((v) => !v);
                  }}
                  className="h-6 px-2 bg-[#11161B] hover:bg-[#171E24] border border-[#1C252C] text-[#4ADE80] font-mono text-[10px] rounded-[2px] flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> ADD
                </button>
                <button
                  onClick={handleResetQueue}
                  className="h-6 px-2 bg-[#11161B] hover:bg-[#171E24] border border-[#1C252C] text-[#8B98A5] font-mono text-[10px] rounded-[2px] flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> RESET
                </button>
              </div>
            }
            noPadding
          >
            {showAddForm && (
              <form
                onSubmit={handleAddProcess}
                className="p-3 bg-[#080B0D] border-b border-[#1C252C] grid grid-cols-2 gap-2 font-mono text-[11px]"
              >
                <input
                  type="text"
                  placeholder="PID (e.g. P108)"
                  value={customPid}
                  onChange={(e) => setCustomPid(e.target.value)}
                  required
                  className="h-7 px-2 bg-[#0C1013] border border-[#1C252C] text-[#E6EDF3]"
                />
                <input
                  type="number"
                  placeholder="Burst"
                  value={customBurst}
                  onChange={(e) => setCustomBurst(Number(e.target.value))}
                  min="1"
                  className="h-7 px-2 bg-[#0C1013] border border-[#1C252C] text-[#E6EDF3]"
                />
                <input
                  type="number"
                  placeholder="Arrival"
                  value={customArrival}
                  onChange={(e) => setCustomArrival(Number(e.target.value))}
                  min="0"
                  className="h-7 px-2 bg-[#0C1013] border border-[#1C252C] text-[#E6EDF3]"
                />
                <input
                  type="number"
                  placeholder="Priority"
                  value={customPriority}
                  onChange={(e) => setCustomPriority(Number(e.target.value))}
                  min="0"
                  className="h-7 px-2 bg-[#0C1013] border border-[#1C252C] text-[#E6EDF3]"
                />
                <button
                  type="submit"
                  className="h-7 bg-[#12271B] border border-[#265438] text-[#4ADE80] font-bold rounded-[2px] cursor-pointer"
                >
                  INSERT
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="h-7 bg-[#11161B] border border-[#1C252C] text-[#8B98A5] rounded-[2px] cursor-pointer"
                >
                  CANCEL
                </button>
              </form>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PID</TableHead>
                  <TableHead className="text-right">ARR</TableHead>
                  <TableHead className="text-right">BURST</TableHead>
                  <TableHead className="text-right">PRI</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedulerQueue.map((p) => {
                  const isRunningProc = pointInTimeRunningPid === p.pid;
                  const c = getPidColor(p.pid);
                  return (
                    <TableRow key={p.pid} className={isRunningProc ? "bg-[#12271B]/60" : ""}>
                      <TableCell className="font-bold flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-[1px] ${c.bg}`} />
                        <span className={isRunningProc ? "text-[#4ADE80]" : "text-[#E6EDF3]"}>{p.pid}</span>
                      </TableCell>
                      <TableCell className="text-right text-[#8B98A5]">{p.arrivalTime}</TableCell>
                      <TableCell className="text-right">{p.burstTime}</TableCell>
                      <TableCell className="text-right text-[#F59E0B]">{p.priority}</TableCell>
                      <TableCell className="text-center">
                        <button
                          onClick={() => handleRemove(p.pid)}
                          className="text-[#53616E] hover:text-[#F87171] p-1 cursor-pointer"
                          title="Remove"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Panel>
        </div>

        {/* Right Visualizations */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <ExecutionPlayer
            traceEvents={traceEvents}
            currentStep={currentStep}
            onStepChange={setCurrentStep}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            speed={playbackSpeed}
            setSpeed={setPlaybackSpeed}
            simulationTime={currentSimTime}
            moduleName="CPU SCHEDULER"
          />

          <ExecutionTimeline
            traceEvents={traceEvents}
            currentStep={currentStep}
            onSelectStep={setCurrentStep}
          />

          {/* Cinematic Gantt + Multi-Lane Execution View */}
          <Panel
            title="Synchronized Gantt Timeline & Process Lanes"
            code="GANTT"
            brackets
            actions={
              traceEvents.length > 0 && (
                <div className="font-mono text-[10px] text-[#38BDF8]">
                  READY QUEUE: {pointInTimeReadyQueue.length > 0 ? pointInTimeReadyQueue.join(" → ") : "EMPTY"}
                </div>
              )
            }
          >
            <div className="space-y-4 py-2">
              {/* Time axis */}
              <div className="flex justify-between font-mono text-[10px] text-[#53616E] tabular-nums">
                <span>0 ms</span>
                <span>{Math.round(totalSimTime * 0.25)} ms</span>
                <span>{Math.round(totalSimTime * 0.5)} ms</span>
                <span>{Math.round(totalSimTime * 0.75)} ms</span>
                <span>{totalSimTime} ms</span>
              </div>

              {/* Unified Gantt Strip */}
              <div ref={ganttRef} className="w-full h-12 bg-[#080B0D] border border-[#1C252C] rounded-[2px] flex relative overflow-hidden">
                {visibleGanttBlocks.length > 0 ? (
                  visibleGanttBlocks.map((block: any, idx: number) => {
                    const isActive = block.start <= currentSimTime && currentSimTime < block.end;
                    const color = getPidColor(block.pid);
                    return (
                      <div
                        key={idx}
                        style={{ width: `${Math.max(2, (block.duration / Math.max(1, totalSimTime)) * 100)}%` }}
                        className={`gantt-seg h-full border-r border-[#050708] flex items-center justify-center ${color.bg} ${
                          isActive ? "ring-2 ring-[#E6EDF3] z-10 brightness-110" : "opacity-85"
                        } transition-all relative group`}
                        title={`${block.pid}: ${block.start}ms – ${block.end}ms (${block.duration}ms)`}
                      >
                        <span className={`font-mono text-[10px] font-bold ${color.text} truncate px-1`}>
                          {block.pid}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-mono text-xs text-[#53616E]">
                    EXECUTE SCHEDULER TO RENDER SYNCHRONIZED GANTT TIMELINE
                  </div>
                )}
              </div>

              {/* Individual Process Execution Lanes */}
              {allGanttBlocks.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-[#141B21]">
                  <div className="font-mono text-[9px] text-[#53616E] tracking-widest uppercase">
                    Per-Process Execution Lanes
                  </div>
                  {schedulerQueue.map((proc) => {
                    const procBlocks = visibleGanttBlocks.filter((b: any) => b.pid === proc.pid);
                    const color = getPidColor(proc.pid);
                    const isActiveProc = pointInTimeRunningPid === proc.pid;
                    return (
                      <div key={proc.pid} className="flex items-center gap-2">
                        <div className="w-16 font-mono text-[10px] flex items-center gap-1.5 shrink-0">
                          <span className={`w-1.5 h-1.5 rounded-full ${isActiveProc ? "bg-[#3ECF72] animate-pulse" : "bg-[#2A3844]"}`} />
                          <span className={isActiveProc ? "text-[#4ADE80] font-bold" : "text-[#8B98A5]"}>
                            {proc.pid}
                          </span>
                        </div>
                        <div className="flex-1 h-4 bg-[#080B0D] border border-[#141B21] rounded-[1px] relative overflow-hidden">
                          {procBlocks.map((b: any, i: number) => (
                            <div
                              key={i}
                              className={`absolute top-0 bottom-0 ${color.bg} opacity-85`}
                              style={{
                                left: `${(b.start / Math.max(1, totalSimTime)) * 100}%`,
                                width: `${Math.max(1.5, (b.duration / Math.max(1, totalSimTime)) * 100)}%`,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Panel>

          {/* Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricDisplay
              label="AVG WAIT TIME"
              value={simulationResult ? simulationResult.average_waiting_time.toFixed(2) : "0.00"}
              unit="ms"
              accent="green"
            />
            <MetricDisplay
              label="AVG TURNAROUND"
              value={simulationResult ? simulationResult.average_turnaround_time.toFixed(2) : "0.00"}
              unit="ms"
              accent="cyan"
            />
            <MetricDisplay
              label="AVG RESPONSE"
              value={simulationResult ? simulationResult.average_response_time.toFixed(2) : "0.00"}
              unit="ms"
              accent="amber"
            />
            <MetricDisplay
              label="CPU UTILIZATION"
              value={simulationResult ? simulationResult.cpu_utilization.toFixed(1) : "0.0"}
              unit="%"
              accent="green"
            />
          </div>

          <DecisionInspector
            event={currentEvent}
            stepNumber={currentStep + 1}
            totalSteps={traceEvents.length}
          />

          {/* History Table */}
          <Panel title="Scheduler Simulation History" code="HIST" noPadding>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>RUN</TableHead>
                  <TableHead>TIME</TableHead>
                  <TableHead>ALGORITHM</TableHead>
                  <TableHead className="text-right">AVG WAIT</TableHead>
                  <TableHead className="text-right">AVG TAT</TableHead>
                  <TableHead className="text-right">AVG RESP</TableHead>
                  <TableHead className="text-right">CPU UTIL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length > 0 ? (
                  history.slice(0, 5).map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-[#53616E]">#{h.id}</TableCell>
                      <TableCell className="text-[#8B98A5]">{h.timestamp}</TableCell>
                      <TableCell className="font-bold">
                        {h.algorithm} {h.quantum ? `(Q=${h.quantum})` : ""}
                      </TableCell>
                      <TableCell className="text-right text-[#4ADE80]">{h.average_waiting_time?.toFixed(2)}ms</TableCell>
                      <TableCell className="text-right text-[#38BDF8]">{h.average_turnaround_time?.toFixed(2)}ms</TableCell>
                      <TableCell className="text-right text-[#F59E0B]">{h.average_response_time?.toFixed(2)}ms</TableCell>
                      <TableCell className="text-right text-[#4ADE80]">{h.cpu_utilization?.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-6 text-[#53616E]">
                      No scheduler runs recorded yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Panel>
        </div>
      </div>
    </div>
  );
}
