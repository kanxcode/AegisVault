import { useState, useEffect, useRef } from "react";
import { animate, stagger } from "animejs";
import { shouldReduceMotion } from "@/lib/motion";
import {
  Panel,
  Badge,
  MetricDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ErrorState,
} from "@/components/ui";
import { useStore } from "@/lib/store";
import { Search, Play, RotateCcw, BarChart3, MemoryStick } from "lucide-react";
import { api } from "@/lib/api";
import {
  ExecutionPlayer,
  ExecutionTimeline,
  DecisionInspector,
  AlgorithmComparison,
} from "@/components/trace";
import type { TraceEvent } from "@/types/trace";

export default function MemoryManager() {
  const { processes, addEvent, setActiveExecution, setExecutingSimulation, pushNotification } = useStore();
  const [memoryBlocks, setMemoryBlocks] = useState<any[]>([]);
  const [algorithm, setAlgorithm] = useState("BEST_FIT");
  const [isRunning, setIsRunning] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [showComparison, setShowComparison] = useState<boolean>(false);

  const loadBlocks = async () => {
    try {
      const [blocks, hist] = await Promise.all([
        api.getMemoryBlocks(),
        api.getMemoryHistory(6).catch(() => []),
      ]);
      if (Array.isArray(blocks) && blocks.length > 0) {
        setMemoryBlocks(blocks);
      }
      if (Array.isArray(hist)) setHistory(hist);
    } catch {
      setMemoryBlocks(useStore.getState().memoryBlocks);
    }
  };

  useEffect(() => {
    loadBlocks();
  }, []);

  const handleSimulate = async () => {
    setIsRunning(true);
    setExecutingSimulation(true);
    setIsPlaying(false);
    setErrorMsg(null);
    try {
      const activeProcs = processes
        .filter((p) => p.state !== "TERMINATED" && p.memory > 0)
        .map((p) => ({ pid: p.pid, size: p.memory }));

      if (activeProcs.length === 0) {
        setErrorMsg("No active processes available requiring memory allocation.");
        setIsRunning(false);
        setExecutingSimulation(false);
        return;
      }

      const data = await api.simulateMemory({
        algorithm,
        blocks: memoryBlocks.map((b) => ({ id: b.id, size: b.size, status: b.status })),
        processes: activeProcs,
      });

      setSimResult(data);
      const events: TraceEvent[] = data.trace_events || [];
      setTraceEvents(events);
      setCurrentStep(0);

      const allocMap: Record<string, string> = {};
      data.allocations.forEach((a: any) => {
        allocMap[a.block_id] = a.pid;
      });

      setMemoryBlocks((prev) =>
        prev.map((b) => {
          const remaining = data.remaining_blocks.find((rb: any) => rb.id === b.id);
          if (remaining) {
            return {
              ...b,
              status: remaining.status,
              processId: allocMap[b.id] || null,
            };
          }
          return b;
        })
      );

      if (data.execution_id) {
        setActiveExecution({
          execution_id: data.execution_id,
          module: "memory_manager",
          algorithm,
          status: "COMPLETED",
          total_steps: events.length,
        });
      }

      pushNotification({
        title: "MEMORY SIMULATION COMPLETE",
        message: `${algorithm}: ${data.allocated_memory}MB allocated, ${data.fragmentation}MB fragmentation`,
        severity: "SUCCESS",
        module: "MEM",
        execution_id: data.execution_id,
      });

      addEvent({
        module: "MEM",
        event: "MEMORY_ALLOCATION_COMPLETED",
        severity: "INFO",
        description: `Simulated ${algorithm}: ${data.allocated_memory}MB allocated with ${data.fragmentation}MB fragmentation.`,
      });

      api.getMemoryHistory(6).then((h) => Array.isArray(h) && setHistory(h)).catch(() => { });
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to simulate memory allocation");
    } finally {
      setIsRunning(false);
      setExecutingSimulation(false);
    }
  };

  const handleReset = async () => {
    try {
      const blocks = await api.resetMemoryBlocks();
      setMemoryBlocks(blocks);
      setSimResult(null);
      setTraceEvents([]);
      setCurrentStep(0);
      setIsPlaying(false);
      setErrorMsg(null);
    } catch {
      await loadBlocks();
    }
  };

  const currentEvent = traceEvents[currentStep] || null;
  const currentSimTime = currentEvent ? currentEvent.simulation_time : 0;
  const activeStepBlocks = (currentEvent?.state_after?.memory_map as any[]) || memoryBlocks;

  const totalMemory = activeStepBlocks.reduce((acc, b) => acc + (b.size || 0), 0);
  const usedMemory = activeStepBlocks
    .filter((b) => b.status === "ALLOCATED")
    .reduce((acc, b) => acc + (b.size || 0), 0);
  const freeMemory = totalMemory - usedMemory;
  const utilization = totalMemory > 0 ? ((usedMemory / totalMemory) * 100).toFixed(1) : "0.0";

  const filteredBlocks = activeStepBlocks.filter(
    (b) =>
      b.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.processId && b.processId.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (b.startAddress && b.startAddress.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const ramStripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!simResult || shouldReduceMotion() || !ramStripRef.current) return;
    const segs = ramStripRef.current.querySelectorAll(".ram-seg");
    if (segs.length === 0) return;
    const anim = animate(segs, {
      opacity: [0.4, 1],
      scaleY: [0.85, 1],
      delay: stagger(35),
      duration: 280,
      ease: "outExpo",
    });
    return () => {
      anim.pause();
    };
  }, [simResult, currentStep]);

  return (
    <div className="flex flex-col gap-4 max-w-[1440px] mx-auto pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1C252C] pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#0F2430] border border-[#1E4B63] text-[#38BDF8] rounded-[2px]">
              MEM-03
            </span>
            <MemoryStick className="w-4 h-4 text-[#38BDF8]" />
            <h1 className="font-display text-xl font-bold tracking-[0.08em] text-[#E6EDF3] uppercase">
              Memory Manager &amp; Partition Map
            </h1>
          </div>
          <p className="font-mono text-[10px] text-[#8B98A5] tracking-widest uppercase">
            Contiguous Segment Visualizer • Candidate Evaluation • Fragmentation Telemetry
          </p>
        </div>

        <button
          onClick={() => setShowComparison(!showComparison)}
          className={`h-8 px-3 font-mono text-xs font-semibold rounded-[2px] border flex items-center gap-1.5 transition-colors cursor-pointer ${showComparison
              ? "bg-[#281E0E] border-[#594019] text-[#F59E0B]"
              : "bg-[#0C1013] hover:bg-[#171E24] border-[#1C252C] text-[#8B98A5] hover:text-[#E6EDF3]"
            }`}
        >
          <BarChart3 className="w-3.5 h-3.5 text-[#F59E0B]" />
          <span>{showComparison ? "HIDE BENCHMARK" : "INLINE BENCHMARK"}</span>
        </button>
      </div>

      {errorMsg && <ErrorState message={errorMsg} />}

      {showComparison && (
        <AlgorithmComparison
          moduleType="memory"
          defaultPayload={{
            blocks: memoryBlocks.map((b) => ({ id: b.id, size: b.size, status: b.status })),
            processes: processes
              .filter((p) => p.state !== "TERMINATED" && p.memory > 0)
              .map((p) => ({ pid: p.pid, size: p.memory })),
          }}
          onApplyAlgorithm={(algo) => {
            setAlgorithm(algo);
            setShowComparison(false);
          }}
        />
      )}

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#53616E]" />
          <input
            type="text"
            placeholder="Search block ID, address, or PID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 w-64 bg-[#0C1013] border border-[#1C252C] rounded-[2px] pl-8 pr-2.5 text-xs text-[#E6EDF3] placeholder:text-[#53616E] focus:outline-none focus:border-[#38BDF8] font-mono"
          />
        </div>
        <select
          className="h-8 bg-[#0C1013] border border-[#1C252C] rounded-[2px] px-2.5 text-xs text-[#E6EDF3] focus:outline-none focus:border-[#38BDF8] font-mono cursor-pointer"
          value={algorithm}
          onChange={(e) => setAlgorithm(e.target.value)}
        >
          <option value="FIRST_FIT">FIRST FIT</option>
          <option value="BEST_FIT">BEST FIT</option>
          <option value="WORST_FIT">WORST FIT</option>
        </select>

        <button
          onClick={handleReset}
          className="h-8 px-3 bg-[#0C1013] hover:bg-[#171E24] border border-[#1C252C] text-[#8B98A5] hover:text-[#E6EDF3] text-xs font-mono rounded-[2px] flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>RESET RAM</span>
        </button>

        <button
          onClick={handleSimulate}
          disabled={isRunning}
          className="h-8 px-4 ml-auto bg-[#12271B] hover:bg-[#183525] border border-[#265438] disabled:opacity-40 text-[#4ADE80] text-xs font-mono font-bold rounded-[2px] flex items-center gap-2 uppercase cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{isRunning ? "ALLOCATING..." : "SIMULATE ALLOCATION"}</span>
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricDisplay label="TOTAL RAM" value={totalMemory} unit="MB" accent="neutral" />
        <MetricDisplay
          label="ALLOCATED"
          value={usedMemory}
          unit="MB"
          accent="cyan"
          progress={Number(utilization)}
        />
        <MetricDisplay label="FREE SPACE" value={freeMemory} unit="MB" accent="green" />
        <MetricDisplay
          label="FRAGMENTATION"
          value={simResult ? simResult.fragmentation : "0"}
          unit="MB"
          accent="amber"
          sublabel={
            simResult?.unallocated_processes?.length > 0
              ? `Unallocated: ${simResult.unallocated_processes.join(", ")}`
              : "All queued requests satisfied"
          }
        />
      </div>

      {/* Linear Proportional Physical Memory Strip */}
      <Panel title="Physical Address Space Topology (Proportional Segments)" code="RAM-MAP" brackets>
        <div className="space-y-2 py-1">
          <div ref={ramStripRef} className="w-full h-11 bg-[#080B0D] border border-[#1C252C] rounded-[2px] flex overflow-hidden">
            {activeStepBlocks.map((block) => {
              const pct = totalMemory > 0 ? (block.size / totalMemory) * 100 : 0;
              const isAllocated = block.status === "ALLOCATED";
              const isHighlighted =
                currentEvent?.affected_entities?.includes(block.id) ||
                currentEvent?.entity === block.id;
              return (
                <div
                  key={block.id}
                  style={{ width: `${Math.max(4, pct)}%` }}
                  className={`ram-seg h-full border-r border-[#050708] flex flex-col items-center justify-center px-1 font-mono transition-all ${isAllocated
                      ? "bg-[#0F2430] text-[#38BDF8]"
                      : "bg-[#12271B]/60 text-[#4ADE80]"
                    } ${isHighlighted ? "ring-2 ring-[#F59E0B] z-10" : ""}`}
                  title={`${block.id} (${block.size}MB) — ${block.status}${block.processId ? ` [${block.processId}]` : ""}`}
                >
                  <span className="text-[10px] font-bold truncate">
                    {isAllocated ? block.processId || block.allocated_pid || block.id : "FREE"}
                  </span>
                  <span className="text-[9px] opacity-75">{block.size}MB</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 font-mono text-[10px] text-[#8B98A5]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#0F2430] border border-[#1E4B63]" /> ALLOCATED REGION
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#12271B]/60 border border-[#265438]" /> FREE HOLE
            </span>
          </div>
        </div>
      </Panel>

      <ExecutionPlayer
        traceEvents={traceEvents}
        currentStep={currentStep}
        onStepChange={setCurrentStep}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        speed={playbackSpeed}
        setSpeed={setPlaybackSpeed}
        simulationTime={currentSimTime}
        moduleName="MEMORY MANAGER"
      />

      <ExecutionTimeline
        traceEvents={traceEvents}
        currentStep={currentStep}
        onSelectStep={setCurrentStep}
      />

      <DecisionInspector
        event={currentEvent}
        stepNumber={currentStep + 1}
        totalSteps={traceEvents.length}
      />

      {/* Segment Table + Allocation History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <Panel title="Partition Descriptor Table" code="SEG" noPadding>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>BLOCK</TableHead>
                  <TableHead>ADDRESS</TableHead>
                  <TableHead className="text-right">SIZE</TableHead>
                  <TableHead>STATUS</TableHead>
                  <TableHead>OWNER PID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBlocks.map((block) => (
                  <TableRow key={block.id}>
                    <TableCell className="font-bold">{block.id}</TableCell>
                    <TableCell className="text-[#8B98A5]">
                      {block.startAddress || `0x${block.start_address?.toString(16).toUpperCase() || "0000"}`}
                    </TableCell>
                    <TableCell className="text-right">{block.size} MB</TableCell>
                    <TableCell>
                      <Badge variant={block.status === "ALLOCATED" ? "cyan" : "green"} dot>
                        {block.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[#E6EDF3]">
                      {block.processId || block.allocated_pid || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </div>

        <div className="lg:col-span-5">
          <Panel title="Allocation History" code="HIST" noPadding>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>RUN</TableHead>
                  <TableHead>ALGO</TableHead>
                  <TableHead className="text-right">ALLOC</TableHead>
                  <TableHead className="text-right">FRAG</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length > 0 ? (
                  history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-[#53616E]">#{h.id}</TableCell>
                      <TableCell className="font-bold">{h.algorithm}</TableCell>
                      <TableCell className="text-right text-[#4ADE80]">{h.allocated_memory}MB</TableCell>
                      <TableCell className="text-right text-[#F59E0B]">{h.fragmentation}MB</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-[#53616E]">
                      No allocation runs logged yet.
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
