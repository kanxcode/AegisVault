import { useState, useMemo, useRef, useEffect } from "react";
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
import {
  Swords,
  Cpu,
  MemoryStick,
  HardDrive,
  Play,
  Plus,
  Trash2,
  Award,
  Activity,
  Info,
  SlidersHorizontal,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { ExecutionPlayer, ExecutionTimeline, DecisionInspector } from "@/components/trace";
import type {
  CpuComparisonData,
  MemoryComparisonData,
  DiskComparisonData,
  TraceEvent,
} from "@/types/trace";
import { cn } from "@/lib/utils";

type ArenaTab = "CPU" | "MEMORY" | "DISK";

const CPU_ALGOS = ["FCFS", "SJF", "ROUND_ROBIN", "PRIORITY"] as const;
const MEM_ALGOS = ["FIRST_FIT", "BEST_FIT", "WORST_FIT"] as const;
const DISK_ALGOS = ["FCFS", "SSTF", "SCAN", "C-SCAN"] as const;

const PROC_COLORS = [
  "bg-[#3ECF72] text-[#050708]",
  "bg-[#38BDF8] text-[#050708]",
  "bg-[#F59E0B] text-[#050708]",
  "bg-[#2DD4BF] text-[#050708]",
  "bg-[#FB7185] text-[#050708]",
  "bg-[#A3E635] text-[#050708]",
  "bg-[#94A3B8] text-[#050708]",
];

function countDirectionChanges(path: number[]): number {
  if (!path || path.length < 3) return 0;
  let changes = 0;
  let prevDir = 0;
  for (let i = 1; i < path.length; i++) {
    const diff = path[i] - path[i - 1];
    if (diff === 0) continue;
    const dir = diff > 0 ? 1 : -1;
    if (prevDir !== 0 && dir !== prevDir) changes++;
    prevDir = dir;
  }
  return changes;
}

export default function AlgorithmBattleLab() {
  const { setExecutingSimulation, pushNotification } = useStore();

  const [arena, setArena] = useState<ArenaTab>("CPU");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // --- CPU ARENA STATE ---
  const [cpuProcesses, setCpuProcesses] = useState([
    { pid: "P1", arrival_time: 0, burst_time: 10, priority: 2 },
    { pid: "P2", arrival_time: 1, burst_time: 3, priority: 1 },
    { pid: "P3", arrival_time: 2, burst_time: 6, priority: 3 },
    { pid: "P4", arrival_time: 4, burst_time: 2, priority: 0 },
  ]);
  const [cpuQuantum, setCpuQuantum] = useState(3);
  const [selectedCpuAlgos, setSelectedCpuAlgos] = useState<string[]>([...CPU_ALGOS]);
  const [cpuMetric, setCpuMetric] = useState<"average_waiting_time" | "average_turnaround_time" | "average_response_time" | "makespan">("average_waiting_time");
  const [cpuResult, setCpuResult] = useState<CpuComparisonData | null>(null);

  // --- MEMORY ARENA STATE ---
  const [memBlocks, setMemBlocks] = useState([
    { id: "B1", size: 100, status: "FREE" },
    { id: "B2", size: 500, status: "FREE" },
    { id: "B3", size: 200, status: "FREE" },
    { id: "B4", size: 300, status: "FREE" },
    { id: "B5", size: 600, status: "FREE" },
  ]);
  const [memRequests, setMemRequests] = useState([
    { pid: "P1", size: 212 },
    { pid: "P2", size: 417 },
    { pid: "P3", size: 112 },
    { pid: "P4", size: 426 },
  ]);
  const [selectedMemAlgos, setSelectedMemAlgos] = useState<string[]>([...MEM_ALGOS]);
  const [memMetric, setMemMetric] = useState<"fragmentation" | "allocated_memory" | "unallocated_count">("fragmentation");
  const [memResult, setMemResult] = useState<MemoryComparisonData | null>(null);

  // --- DISK ARENA STATE ---
  const [diskHead, setDiskHead] = useState(53);
  const [diskSize, setDiskSize] = useState(200);
  const [diskDirection, setDiskDirection] = useState<"RIGHT" | "LEFT">("RIGHT");
  const [diskRequestsInput, setDiskRequestsInput] = useState("98, 183, 37, 122, 14, 124, 65, 67");
  const [selectedDiskAlgos, setSelectedDiskAlgos] = useState<string[]>([...DISK_ALGOS]);
  const [diskMetric, setDiskMetric] = useState<"total_head_movement" | "average_seek_distance" | "direction_changes">("total_head_movement");
  const [diskResult, setDiskResult] = useState<DiskComparisonData | null>(null);

  // --- TRACE INSPECTOR STATE ---
  const [inspectedAlgo, setInspectedAlgo] = useState<string | null>(null);
  const [inspectedTrace, setInspectedTrace] = useState<TraceEvent[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const parsedDiskRequests = useMemo(
    () =>
      diskRequestsInput
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => !isNaN(n) && n >= 0 && n < diskSize),
    [diskRequestsInput, diskSize]
  );

  const toggleSelection = (list: string[], setList: (v: string[]) => void, item: string) => {
    if (list.includes(item)) {
      if (list.length <= 2) return; // Require at least 2 algorithms to compare
      setList(list.filter((x) => x !== item));
    } else {
      setList([...list, item]);
    }
  };

  const handleInspectTrace = (algo: string, events: TraceEvent[] = []) => {
    setInspectedAlgo(algo);
    setInspectedTrace(events);
    setCurrentStep(0);
    setIsPlaying(false);
  };

  const handleRunBattle = async () => {
    setLoading(true);
    setExecutingSimulation(true);
    setErrorMsg(null);
    setInspectedAlgo(null);
    setInspectedTrace([]);

    try {
      if (arena === "CPU") {
        if (cpuProcesses.length === 0) throw new Error("Add at least one process to benchmark.");
        const res: CpuComparisonData = await api.compareCpu({
          processes: cpuProcesses.map((p) => ({
            pid: p.pid,
            arrival_time: Number(p.arrival_time),
            burst_time: Math.max(1, Number(p.burst_time)),
            priority: Number(p.priority),
          })),
          quantum: Math.max(1, Number(cpuQuantum)),
        });
        setCpuResult(res);
        const firstAlgo = selectedCpuAlgos[0];
        if (res.results?.[firstAlgo]?.trace_events) {
          handleInspectTrace(firstAlgo, res.results[firstAlgo].trace_events);
        }
        pushNotification({
          title: "BATTLE LAB // CPU BENCHMARK",
          message: `Best wait: ${res.best_waiting_algorithm} · Best response: ${res.best_response_algorithm}`,
          severity: "SUCCESS",
          module: "LAB",
        });
      } else if (arena === "MEMORY") {
        if (memBlocks.length === 0 || memRequests.length === 0) {
          throw new Error("Configure at least one memory partition and one process request.");
        }
        const res: MemoryComparisonData = await api.compareMemory({
          blocks: memBlocks.map((b) => ({ id: b.id, size: Math.max(1, Number(b.size)), status: b.status })),
          processes: memRequests.map((p) => ({ pid: p.pid, size: Math.max(1, Number(p.size)) })),
        });
        setMemResult(res);
        const firstAlgo = selectedMemAlgos[0];
        if (res.results?.[firstAlgo]?.trace_events) {
          handleInspectTrace(firstAlgo, res.results[firstAlgo].trace_events);
        }
        pushNotification({
          title: "BATTLE LAB // MEMORY BENCHMARK",
          message: `Evaluated ${selectedMemAlgos.length} allocation policies across ${memRequests.length} requests`,
          severity: "SUCCESS",
          module: "LAB",
        });
      } else if (arena === "DISK") {
        if (parsedDiskRequests.length === 0) {
          throw new Error(`Provide valid cylinder requests within 0..${diskSize - 1}.`);
        }
        const res: DiskComparisonData = await api.compareDisk({
          head: Math.min(Math.max(0, Number(diskHead)), diskSize - 1),
          requests: parsedDiskRequests,
          disk_size: Number(diskSize),
          direction: diskDirection,
        });
        setDiskResult(res);
        const firstAlgo = selectedDiskAlgos[0];
        if (res.results?.[firstAlgo]?.trace_events) {
          handleInspectTrace(firstAlgo, res.results[firstAlgo].trace_events);
        }
        pushNotification({
          title: "BATTLE LAB // DISK BENCHMARK",
          message: `Lowest head travel: ${res.best_movement_algorithm}`,
          severity: "SUCCESS",
          module: "LAB",
        });
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Battle Lab execution failed.");
    } finally {
      setLoading(false);
      setExecutingSimulation(false);
    }
  };

  // --- DATA-DRIVEN ANALYTICAL INSIGHTS ---
  const cpuInsights = useMemo(() => {
    if (!cpuResult) return null;
    const rows = cpuResult.comparison_table.filter((r) => selectedCpuAlgos.includes(r.algorithm));
    if (rows.length === 0) return null;

    const sorted = [...rows].sort((a, b) => a[cpuMetric] - b[cpuMetric]);
    const winner = sorted[0];
    const trailing = sorted[sorted.length - 1];
    const delta = (trailing[cpuMetric] - winner[cpuMetric]).toFixed(2);

    // Find most disadvantaged process across winner & trailing algorithm from actual waiting_times
    const trailingDetail = cpuResult.results?.[trailing.algorithm];
    const waitingMap: Record<string, number> = trailingDetail?.waiting_times || {};
    const worstProcEntry = Object.entries(waitingMap).sort((a, b) => b[1] - a[1])[0];

    const metricLabel =
      cpuMetric === "average_waiting_time"
        ? "Average Waiting Time"
        : cpuMetric === "average_turnaround_time"
        ? "Average Turnaround Time"
        : cpuMetric === "average_response_time"
        ? "Average Response Time"
        : "Total Makespan";

    const bursts = cpuProcesses.map((p) => p.burst_time);
    const maxBurst = Math.max(...bursts);
    const minBurst = Math.min(...bursts);
    const spreadRatio = minBurst > 0 ? (maxBurst / minBurst).toFixed(1) : "1.0";

    return {
      winner,
      trailing,
      metricLabel,
      delta,
      worstProcEntry,
      workloadNote: `Workload burst spread is ${minBurst}ms–${maxBurst}ms (${spreadRatio}x ratio) across ${cpuProcesses.length} processes.`,
      tradeoffNote:
        winner.algorithm === "SJF"
          ? "SJF lowered average delay by prioritizing shorter bursts, which can delay long-burst tasks when short jobs arrive continuously."
          : winner.algorithm === "ROUND_ROBIN"
          ? `Round Robin (Q=${cpuQuantum}ms) improved responsiveness via time-slicing while incurring ${winner.context_switches} context switches.`
          : winner.algorithm === "PRIORITY"
          ? "Priority dispatch favored low-integer priority tasks, risking starvation for lower-priority processes."
          : "FCFS avoided preemption overhead (fewer context switches), though earlier long bursts create a convoy effect for shorter tasks behind them.",
    };
  }, [cpuResult, selectedCpuAlgos, cpuMetric, cpuProcesses, cpuQuantum]);

  const memInsights = useMemo(() => {
    if (!memResult) return null;
    const rows = memResult.comparison_table.filter((r) => selectedMemAlgos.includes(r.algorithm));
    if (rows.length === 0) return null;

    const sorted = [...rows].sort((a, b) => {
      if (memMetric === "allocated_memory") return b.allocated_memory - a.allocated_memory;
      return a[memMetric] - b[memMetric];
    });
    const winner = sorted[0];
    const trailing = sorted[sorted.length - 1];

    const disadvantagedPids = Array.from(
      new Set(rows.flatMap((r) => r.unallocated_pids))
    );

    const metricLabel =
      memMetric === "fragmentation"
        ? "Remaining Free / Fragmentation"
        : memMetric === "allocated_memory"
        ? "Total Allocated Memory"
        : "Unallocated Request Count";

    return {
      winner,
      trailing,
      metricLabel,
      disadvantagedPids,
      workloadNote: `${memBlocks.length} initial partitions (${memBlocks.reduce((a, b) => a + b.size, 0)} MB total) against ${memRequests.length} process requests (${memRequests.reduce((a, b) => a + b.size, 0)} MB requested).`,
      tradeoffNote:
        winner.algorithm === "BEST_FIT"
          ? "Best Fit selected tightest qualifying holes to preserve large blocks, though tight leftovers may become too small for later requests."
          : winner.algorithm === "WORST_FIT"
          ? "Worst Fit consumed the largest free blocks first, keeping residual fragments larger at the risk of blocking subsequent large requests."
          : "First Fit stopped at the earliest qualifying hole, minimizing search scans while fragmenting lower address regions.",
    };
  }, [memResult, selectedMemAlgos, memMetric, memBlocks, memRequests]);

  const diskInsights = useMemo(() => {
    if (!diskResult) return null;
    const rows = diskResult.comparison_table
      .filter((r) => selectedDiskAlgos.includes(r.algorithm))
      .map((r) => {
        const path = diskResult.results?.[r.algorithm]?.movement_path || [];
        return {
          ...r,
          direction_changes: countDirectionChanges(path),
          movements: (diskResult.results?.[r.algorithm]?.movements || []) as number[],
        };
      });
    if (rows.length === 0) return null;

    const sorted = [...rows].sort((a, b) => a[diskMetric] - b[diskMetric]);
    const winner = sorted[0];
    const trailing = sorted[sorted.length - 1];
    const delta = (trailing[diskMetric] - winner[diskMetric]).toFixed(1);

    // Track with largest individual seek step in trailing algorithm
    const trailingDetail = diskResult.results?.[trailing.algorithm];
    const movements: number[] = trailingDetail?.movements || [];
    const path: number[] = trailingDetail?.movement_path || [];
    let maxSeek = 0;
    let maxSeekTarget: number | null = null;
    movements.forEach((m, i) => {
      if (m > maxSeek) {
        maxSeek = m;
        maxSeekTarget = path[i + 1] ?? null;
      }
    });

    const metricLabel =
      diskMetric === "total_head_movement"
        ? "Total Head Movement"
        : diskMetric === "average_seek_distance"
        ? "Average Seek Distance"
        : "Direction Reversals";

    return {
      rows,
      winner,
      trailing,
      delta,
      metricLabel,
      maxSeek,
      maxSeekTarget,
      workloadNote: `${parsedDiskRequests.length} track requests spanning ${Math.min(...parsedDiskRequests)}–${Math.max(...parsedDiskRequests)} starting from head ${diskHead}.`,
      tradeoffNote:
        winner.algorithm === "SSTF"
          ? "SSTF minimized immediate seek steps by clustering nearby tracks, which can starve distant edge cylinders under continuous local arrivals."
          : winner.algorithm === "SCAN"
          ? "SCAN bounded starvation by sweeping monotonically toward the disk edge before reversing."
          : winner.algorithm === "C-SCAN"
          ? "C-SCAN traded extra return travel for uniform wait times across inner and outer cylinders."
          : "FCFS preserved strict arrival fairness without reordering, resulting in wide back-and-forth head swings.",
    };
  }, [diskResult, selectedDiskAlgos, diskMetric, parsedDiskRequests, diskHead]);

  const pidColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    cpuProcesses.forEach((p, idx) => {
      map[p.pid] = PROC_COLORS[idx % PROC_COLORS.length];
    });
    return map;
  }, [cpuProcesses]);

  const battleResultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shouldReduceMotion() || !battleResultsRef.current) return;
    const cards = battleResultsRef.current.querySelectorAll(".battle-card");
    if (cards.length === 0) return;
    const anim = animate(cards, {
      opacity: [0, 1],
      translateY: [10, 0],
      delay: stagger(55),
      duration: 320,
      ease: "outExpo",
    });
    return () => {
      anim.pause();
    };
  }, [cpuResult, memResult, diskResult, arena]);

  return (
    <div ref={battleResultsRef} className="flex flex-col gap-5 max-w-[1440px] mx-auto pb-10">
      {/* HERO HEADER */}
      <div className="bg-[#0C1013] border border-[#1C252C] rounded-[2px] p-5 aegis-brackets flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[10px] px-2 py-0.5 bg-[#0F2430] border border-[#1E4B63] text-[#38BDF8] rounded-[2px] tracking-[0.15em]">
              LAB-01 // COMPARATIVE ARENA
            </span>
            <Badge variant="green" dot>
              IDENTICAL WORKLOAD ENGINE
            </Badge>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-[0.08em] text-[#E6EDF3] uppercase flex items-center gap-2.5">
            <Swords className="w-5 h-5 text-[#3ECF72]" />
            <span>Algorithm Battle Lab</span>
          </h1>
          <p className="font-mono text-xs text-[#8B98A5] max-w-2xl">
            Execute competing kernel scheduling, memory placement, and disk seek algorithms against identical workloads and inspect real metrics, visualizations, and step-by-step execution traces.
          </p>
        </div>

        {/* Arena Selector */}
        <div className="flex flex-wrap gap-1.5 bg-[#080B0D] p-1 border border-[#1C252C] rounded-[2px] font-mono">
          {[
            { id: "CPU", label: "CPU SCHEDULING", icon: Cpu },
            { id: "MEMORY", label: "MEMORY ALLOCATION", icon: MemoryStick },
            { id: "DISK", label: "DISK SCHEDULING", icon: HardDrive },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = arena === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setArena(tab.id as ArenaTab);
                  setErrorMsg(null);
                  setInspectedAlgo(null);
                  setInspectedTrace([]);
                }}
                className={cn(
                  "px-3.5 py-2 text-xs font-bold rounded-[2px] flex items-center gap-2 transition-colors cursor-pointer",
                  active
                    ? "bg-[#12271B] border border-[#265438] text-[#4ADE80]"
                    : "border border-transparent text-[#8B98A5] hover:text-[#E6EDF3] hover:bg-[#11161B]"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {errorMsg && <ErrorState message={errorMsg} />}

      {/* =================================================================== */}
      {/* ARENA 1: CPU SCHEDULING                                             */}
      {/* =================================================================== */}
      {arena === "CPU" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Shared Workload Config */}
            <div className="lg:col-span-5">
              <Panel
                title="Shared CPU Workload Configuration"
                code="INPUT"
                brackets
                actions={
                  <div className="flex gap-1.5 font-mono text-[10px]">
                    <button
                      onClick={() =>
                        setCpuProcesses([
                          { pid: "P1", arrival_time: 0, burst_time: 18, priority: 3 },
                          { pid: "P2", arrival_time: 1, burst_time: 2, priority: 1 },
                          { pid: "P3", arrival_time: 2, burst_time: 3, priority: 2 },
                          { pid: "P4", arrival_time: 3, burst_time: 2, priority: 0 },
                        ])
                      }
                      className="px-2 py-0.5 bg-[#11161B] border border-[#1C252C] text-[#38BDF8] rounded-[2px] cursor-pointer"
                    >
                      Convoy Preset
                    </button>
                    <button
                      onClick={() =>
                        setCpuProcesses((prev) => [
                          ...prev,
                          { pid: `P${prev.length + 1}`, arrival_time: prev.length, burst_time: 5, priority: 1 },
                        ])
                      }
                      className="px-2 py-0.5 bg-[#12271B] border border-[#265438] text-[#4ADE80] rounded-[2px] flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </div>
                }
              >
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#141B21]">
                    <div className="flex flex-wrap gap-1.5">
                      {CPU_ALGOS.map((a) => {
                        const on = selectedCpuAlgos.includes(a);
                        return (
                          <button
                            key={a}
                            onClick={() => toggleSelection(selectedCpuAlgos, setSelectedCpuAlgos, a)}
                            className={cn(
                              "px-2 py-1 text-[10px] rounded-[2px] border cursor-pointer",
                              on
                                ? "bg-[#0F2430] border-[#1E4B63] text-[#38BDF8] font-bold"
                                : "bg-[#080B0D] border-[#1C252C] text-[#53616E]"
                            )}
                          >
                            {a}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[#8B98A5]">RR Q:</span>
                      <input
                        type="number"
                        min={1}
                        value={cpuQuantum}
                        onChange={(e) => setCpuQuantum(Number(e.target.value))}
                        className="w-14 h-7 bg-[#080B0D] border border-[#1C252C] px-2 text-xs text-[#E6EDF3] rounded-[2px]"
                      />
                    </div>
                  </div>

                  <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-1.5">
                    {cpuProcesses.map((proc, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-1.5 items-center bg-[#080B0D] p-1.5 border border-[#1C252C] rounded-[2px]">
                        <input
                          value={proc.pid}
                          onChange={(e) => {
                            const next = [...cpuProcesses];
                            next[idx] = { ...next[idx], pid: e.target.value.toUpperCase() };
                            setCpuProcesses(next);
                          }}
                          className="col-span-3 h-7 bg-[#0C1013] border border-[#1C252C] px-1.5 text-[#4ADE80] font-bold rounded-[2px]"
                          aria-label="PID"
                        />
                        <input
                          type="number"
                          min={0}
                          value={proc.arrival_time}
                          onChange={(e) => {
                            const next = [...cpuProcesses];
                            next[idx] = { ...next[idx], arrival_time: Number(e.target.value) };
                            setCpuProcesses(next);
                          }}
                          title="Arrival Time"
                          className="col-span-3 h-7 bg-[#0C1013] border border-[#1C252C] px-1.5 text-[#E6EDF3] rounded-[2px]"
                        />
                        <input
                          type="number"
                          min={1}
                          value={proc.burst_time}
                          onChange={(e) => {
                            const next = [...cpuProcesses];
                            next[idx] = { ...next[idx], burst_time: Number(e.target.value) };
                            setCpuProcesses(next);
                          }}
                          title="Burst Time"
                          className="col-span-3 h-7 bg-[#0C1013] border border-[#1C252C] px-1.5 text-[#38BDF8] rounded-[2px]"
                        />
                        <input
                          type="number"
                          min={0}
                          value={proc.priority}
                          onChange={(e) => {
                            const next = [...cpuProcesses];
                            next[idx] = { ...next[idx], priority: Number(e.target.value) };
                            setCpuProcesses(next);
                          }}
                          title="Priority (0=highest)"
                          className="col-span-2 h-7 bg-[#0C1013] border border-[#1C252C] px-1.5 text-[#F59E0B] rounded-[2px]"
                        />
                        <button
                          onClick={() => setCpuProcesses(cpuProcesses.filter((_, i) => i !== idx))}
                          className="col-span-1 flex justify-center text-[#53616E] hover:text-[#F87171] cursor-pointer"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="grid grid-cols-12 gap-1.5 text-[9px] text-[#53616E] px-1.5">
                      <span className="col-span-3">PID</span>
                      <span className="col-span-3">ARRIVAL</span>
                      <span className="col-span-3">BURST (ms)</span>
                      <span className="col-span-2">PRI</span>
                      <span className="col-span-1" />
                    </div>
                  </div>

                  <button
                    onClick={handleRunBattle}
                    disabled={loading}
                    className="w-full h-9 bg-[#12271B] hover:bg-[#183525] border border-[#265438] text-[#4ADE80] font-bold rounded-[2px] flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{loading ? "EXECUTING BENCHMARK..." : "RUN CPU BATTLE"}</span>
                  </button>
                </div>
              </Panel>
            </div>

            {/* Analytical Insights Panel */}
            <div className="lg:col-span-7">
              <Panel
                title="Analytical Comparison Insights"
                code="INSIGHTS"
                brackets
                actions={
                  <div className="flex items-center gap-2 font-mono text-[10px]">
                    <SlidersHorizontal className="w-3 h-3 text-[#F59E0B]" />
                    <select
                      value={cpuMetric}
                      onChange={(e) => setCpuMetric(e.target.value as any)}
                      className="h-7 bg-[#080B0D] border border-[#1C252C] px-2 text-[#E6EDF3] rounded-[2px]"
                    >
                      <option value="average_waiting_time">Metric: Avg Waiting Time</option>
                      <option value="average_turnaround_time">Metric: Avg Turnaround</option>
                      <option value="average_response_time">Metric: Avg Response</option>
                      <option value="makespan">Metric: Makespan</option>
                    </select>
                  </div>
                }
                className="h-full"
              >
                {cpuInsights && cpuResult ? (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <MetricDisplay
                        label={`LEADER (${cpuInsights.metricLabel})`}
                        value={cpuInsights.winner.algorithm}
                        sublabel={`${cpuInsights.winner[cpuMetric]} ms`}
                        accent="green"
                      />
                      <MetricDisplay
                        label="SPREAD DELTA"
                        value={cpuInsights.delta}
                        unit="ms"
                        sublabel={`vs ${cpuInsights.trailing.algorithm} (${cpuInsights.trailing[cpuMetric]} ms)`}
                        accent="cyan"
                      />
                      <MetricDisplay
                        label="MOST DELAYED TASK"
                        value={cpuInsights.worstProcEntry ? cpuInsights.worstProcEntry[0] : "—"}
                        sublabel={
                          cpuInsights.worstProcEntry
                            ? `${cpuInsights.worstProcEntry[1]}ms wait under ${cpuInsights.trailing.algorithm}`
                            : "No delay data"
                        }
                        accent="amber"
                      />
                    </div>

                    <div className="p-3 bg-[#080B0D] border border-[#1C252C] rounded-[2px] space-y-2 text-[11px] leading-relaxed">
                      <div className="flex items-center gap-1.5 text-[#4ADE80] font-bold text-[10px] uppercase">
                        <Info className="w-3.5 h-3.5" />
                        <span>Calculated Outcome Rationale</span>
                      </div>
                      <p className="text-[#E6EDF3]">
                        On this workload, <strong>{cpuInsights.winner.algorithm}</strong> achieved the lowest{" "}
                        {cpuInsights.metricLabel.toLowerCase()} ({cpuInsights.winner[cpuMetric]} ms), outperforming{" "}
                        {cpuInsights.trailing.algorithm} by {cpuInsights.delta} ms.
                      </p>
                      <p className="text-[#8B98A5]">{cpuInsights.tradeoffNote}</p>
                      <p className="text-[#38BDF8] text-[10px]">{cpuInsights.workloadNote}</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center py-14 font-mono text-xs text-[#53616E]">
                    EXECUTE CPU BATTLE TO GENERATE DATA-DRIVEN TRADE-OFF ANALYSIS
                  </div>
                )}
              </Panel>
            </div>
          </div>

          {/* Side-by-Side Gantt Charts & Comparison Table */}
          {cpuResult && (
            <>
              <Panel title="Side-by-Side Synchronized Gantt Timelines" code="GANTT-CMP" brackets>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedCpuAlgos.map((algo) => {
                    const detail = cpuResult.results?.[algo];
                    const row = cpuResult.comparison_table.find((r) => r.algorithm === algo);
                    if (!detail || !row) return null;
                    const maxEnd = detail.gantt?.length ? detail.gantt[detail.gantt.length - 1].end : 1;
                    const isLeader = algo === cpuInsights?.winner.algorithm;
                    return (
                      <div
                        key={algo}
                        className={cn(
                          "battle-card p-3 bg-[#080B0D] border rounded-[2px] space-y-2 font-mono",
                          isLeader ? "border-[#265438]" : "border-[#1C252C]"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#E6EDF3]">{algo}</span>
                            {isLeader && <Badge variant="green">LEADER</Badge>}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-[#8B98A5]">
                            <span>Wait: <strong className="text-[#4ADE80]">{row.average_waiting_time}ms</strong></span>
                            <button
                              onClick={() => handleInspectTrace(algo, detail.trace_events || [])}
                              className="px-2 py-0.5 bg-[#0F2430] hover:bg-[#143242] border border-[#1E4B63] text-[#38BDF8] rounded-[2px] cursor-pointer"
                            >
                              TRACE ({detail.trace_events?.length || 0})
                            </button>
                          </div>
                        </div>

                        <div className="w-full h-9 bg-[#050708] border border-[#1C252C] rounded-[2px] flex overflow-hidden">
                          {detail.gantt.map((block: any, bi: number) => (
                            <div
                              key={bi}
                              style={{ width: `${Math.max(3, (block.duration / Math.max(1, maxEnd)) * 100)}%` }}
                              className={`h-full border-r border-[#050708] flex items-center justify-center text-[10px] font-bold ${
                                pidColorMap[block.pid] || "bg-[#38BDF8] text-[#050708]"
                              }`}
                              title={`${block.pid}: ${block.start}ms – ${block.end}ms`}
                            >
                              {block.pid}
                            </div>
                          ))}
                        </div>

                        <div className="flex justify-between text-[10px] text-[#53616E]">
                          <span>Order: {row.execution_order.join(" → ")}</span>
                          <span>Makespan: {row.makespan}ms</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Panel title="CPU Scheduling Metrics Matrix" code="MATRIX" noPadding>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ALGORITHM</TableHead>
                      <TableHead className="text-right">AVG WAIT</TableHead>
                      <TableHead className="text-right">AVG TAT</TableHead>
                      <TableHead className="text-right">AVG RESP</TableHead>
                      <TableHead className="text-right">MAKESPAN</TableHead>
                      <TableHead className="text-right">SWITCHES</TableHead>
                      <TableHead>EXECUTION ORDER</TableHead>
                      <TableHead className="text-right">TRACE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cpuResult.comparison_table
                      .filter((r) => selectedCpuAlgos.includes(r.algorithm))
                      .map((row) => {
                        const isBest = row.algorithm === cpuInsights?.winner.algorithm;
                        return (
                          <TableRow key={row.algorithm} className={isBest ? "bg-[#12271B]/35" : ""}>
                            <TableCell className="font-bold flex items-center gap-1.5">
                              <span>{row.algorithm}</span>
                              {isBest && <Award className="w-3.5 h-3.5 text-[#4ADE80]" />}
                            </TableCell>
                            <TableCell className="text-right text-[#4ADE80]">{row.average_waiting_time} ms</TableCell>
                            <TableCell className="text-right text-[#38BDF8]">{row.average_turnaround_time} ms</TableCell>
                            <TableCell className="text-right text-[#F59E0B]">{row.average_response_time} ms</TableCell>
                            <TableCell className="text-right">{row.makespan} ms</TableCell>
                            <TableCell className="text-right">{row.context_switches}</TableCell>
                            <TableCell className="text-[#8B98A5] text-[11px]">{row.execution_order.join(" → ")}</TableCell>
                            <TableCell className="text-right">
                              <button
                                onClick={() =>
                                  handleInspectTrace(
                                    row.algorithm,
                                    cpuResult.results?.[row.algorithm]?.trace_events || []
                                  )
                                }
                                className="px-2 py-0.5 bg-[#11161B] border border-[#1C252C] text-[#38BDF8] text-[10px] rounded-[2px] cursor-pointer"
                              >
                                INSPECT
                              </button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </Panel>

              {/* Per-Process Completion Time Matrix */}
              <Panel title="Per-Process Completion Time Matrix (ms)" code="COMP-T" noPadding>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PID</TableHead>
                      <TableHead className="text-right">ARRIVAL</TableHead>
                      <TableHead className="text-right">BURST</TableHead>
                      {selectedCpuAlgos.map((algo) => (
                        <TableHead key={algo} className="text-right">
                          {algo} FINISH
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cpuProcesses.map((proc) => (
                      <TableRow key={proc.pid}>
                        <TableCell className="font-bold text-[#4ADE80]">{proc.pid}</TableCell>
                        <TableCell className="text-right text-[#8B98A5]">{proc.arrival_time} ms</TableCell>
                        <TableCell className="text-right text-[#38BDF8]">{proc.burst_time} ms</TableCell>
                        {selectedCpuAlgos.map((algo) => {
                          const ct = cpuResult.results?.[algo]?.completion_times?.[proc.pid];
                          const wt = cpuResult.results?.[algo]?.waiting_times?.[proc.pid];
                          return (
                            <TableCell key={algo} className="text-right">
                              {ct !== undefined ? (
                                <span>
                                  <strong className="text-[#E6EDF3]">{ct}ms</strong>{" "}
                                  <span className="text-[10px] text-[#53616E]">(W:{wt ?? 0})</span>
                                </span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Panel>
            </>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* ARENA 2: MEMORY ALLOCATION                                          */}
      {/* =================================================================== */}
      {arena === "MEMORY" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5">
              <Panel
                title="Shared Memory Partitions & Requests"
                code="INPUT"
                brackets
                actions={
                  <button
                    onClick={() => {
                      setMemBlocks([
                        { id: "B1", size: 100, status: "FREE" },
                        { id: "B2", size: 500, status: "FREE" },
                        { id: "B3", size: 200, status: "FREE" },
                        { id: "B4", size: 300, status: "FREE" },
                        { id: "B5", size: 600, status: "FREE" },
                      ]);
                      setMemRequests([
                        { pid: "P1", size: 212 },
                        { pid: "P2", size: 417 },
                        { pid: "P3", size: 112 },
                        { pid: "P4", size: 426 },
                      ]);
                    }}
                    className="px-2 py-0.5 bg-[#11161B] border border-[#1C252C] text-[#38BDF8] font-mono text-[10px] rounded-[2px] cursor-pointer"
                  >
                    Classic Fit Preset
                  </button>
                }
              >
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex flex-wrap gap-1.5 pb-2 border-b border-[#141B21]">
                    {MEM_ALGOS.map((a) => {
                      const on = selectedMemAlgos.includes(a);
                      return (
                        <button
                          key={a}
                          onClick={() => toggleSelection(selectedMemAlgos, setSelectedMemAlgos, a)}
                          className={cn(
                            "px-2 py-1 text-[10px] rounded-[2px] border cursor-pointer",
                            on
                              ? "bg-[#0F2430] border-[#1E4B63] text-[#38BDF8] font-bold"
                              : "bg-[#080B0D] border-[#1C252C] text-[#53616E]"
                          )}
                        >
                          {a}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[10px] text-[#8B98A5]">
                        <span>PARTITIONS (MB)</span>
                        <button
                          onClick={() =>
                            setMemBlocks([...memBlocks, { id: `B${memBlocks.length + 1}`, size: 256, status: "FREE" }])
                          }
                          className="text-[#4ADE80] cursor-pointer"
                        >
                          + Block
                        </button>
                      </div>
                      <div className="space-y-1 max-h-44 overflow-y-auto custom-scrollbar">
                        {memBlocks.map((b, i) => (
                          <div key={i} className="flex gap-1 items-center">
                            <input
                              value={b.id}
                              onChange={(e) => {
                                const next = [...memBlocks];
                                next[i] = { ...next[i], id: e.target.value };
                                setMemBlocks(next);
                              }}
                              className="w-12 h-7 bg-[#080B0D] border border-[#1C252C] px-1.5 text-[#38BDF8]"
                            />
                            <input
                              type="number"
                              min={16}
                              value={b.size}
                              onChange={(e) => {
                                const next = [...memBlocks];
                                next[i] = { ...next[i], size: Number(e.target.value) };
                                setMemBlocks(next);
                              }}
                              className="flex-1 h-7 bg-[#080B0D] border border-[#1C252C] px-1.5 text-[#E6EDF3]"
                            />
                            <button
                              onClick={() => setMemBlocks(memBlocks.filter((_, idx) => idx !== i))}
                              className="text-[#53616E] hover:text-[#F87171] cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[10px] text-[#8B98A5]">
                        <span>REQUESTS (MB)</span>
                        <button
                          onClick={() =>
                            setMemRequests([...memRequests, { pid: `P${memRequests.length + 1}`, size: 128 }])
                          }
                          className="text-[#4ADE80] cursor-pointer"
                        >
                          + Req
                        </button>
                      </div>
                      <div className="space-y-1 max-h-44 overflow-y-auto custom-scrollbar">
                        {memRequests.map((r, i) => (
                          <div key={i} className="flex gap-1 items-center">
                            <input
                              value={r.pid}
                              onChange={(e) => {
                                const next = [...memRequests];
                                next[i] = { ...next[i], pid: e.target.value.toUpperCase() };
                                setMemRequests(next);
                              }}
                              className="w-12 h-7 bg-[#080B0D] border border-[#1C252C] px-1.5 text-[#4ADE80]"
                            />
                            <input
                              type="number"
                              min={1}
                              value={r.size}
                              onChange={(e) => {
                                const next = [...memRequests];
                                next[i] = { ...next[i], size: Number(e.target.value) };
                                setMemRequests(next);
                              }}
                              className="flex-1 h-7 bg-[#080B0D] border border-[#1C252C] px-1.5 text-[#E6EDF3]"
                            />
                            <button
                              onClick={() => setMemRequests(memRequests.filter((_, idx) => idx !== i))}
                              className="text-[#53616E] hover:text-[#F87171] cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleRunBattle}
                    disabled={loading}
                    className="w-full h-9 bg-[#12271B] hover:bg-[#183525] border border-[#265438] text-[#4ADE80] font-bold rounded-[2px] flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{loading ? "EVALUATING..." : "RUN MEMORY BATTLE"}</span>
                  </button>
                </div>
              </Panel>
            </div>

            <div className="lg:col-span-7">
              <Panel
                title="Memory Allocation Insights"
                code="INSIGHTS"
                brackets
                actions={
                  <select
                    value={memMetric}
                    onChange={(e) => setMemMetric(e.target.value as any)}
                    className="h-7 bg-[#080B0D] border border-[#1C252C] px-2 font-mono text-[10px] text-[#E6EDF3] rounded-[2px]"
                  >
                    <option value="fragmentation">Metric: Lowest Fragmentation</option>
                    <option value="allocated_memory">Metric: Most Allocated RAM</option>
                    <option value="unallocated_count">Metric: Fewest Rejections</option>
                  </select>
                }
                className="h-full"
              >
                {memInsights && memResult ? (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <MetricDisplay
                        label={`LEADER (${memInsights.metricLabel})`}
                        value={memInsights.winner.algorithm}
                        sublabel={`${memInsights.winner.allocated_memory}MB placed`}
                        accent="green"
                      />
                      <MetricDisplay
                        label="FRAGMENTATION"
                        value={memInsights.winner.fragmentation}
                        unit="MB"
                        sublabel={`vs ${memInsights.trailing.algorithm}: ${memInsights.trailing.fragmentation}MB`}
                        accent="amber"
                      />
                      <MetricDisplay
                        label="REJECTED REQUESTS"
                        value={
                          memInsights.disadvantagedPids.length > 0
                            ? memInsights.disadvantagedPids.join(", ")
                            : "NONE"
                        }
                        accent={memInsights.disadvantagedPids.length > 0 ? "red" : "green"}
                      />
                    </div>
                    <div className="p-3 bg-[#080B0D] border border-[#1C252C] rounded-[2px] space-y-2 text-[11px] leading-relaxed">
                      <p className="text-[#E6EDF3]">
                        <strong>{memInsights.winner.algorithm}</strong> placed {memInsights.winner.successful_allocations} of{" "}
                        {memRequests.length} processes ({memInsights.winner.allocated_memory} MB allocated, {memInsights.winner.free_memory} MB free).
                      </p>
                      <p className="text-[#8B98A5]">{memInsights.tradeoffNote}</p>
                      <p className="text-[#38BDF8] text-[10px]">{memInsights.workloadNote}</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center py-14 font-mono text-xs text-[#53616E]">
                    EXECUTE MEMORY BATTLE TO COMPARE FIT STRATEGIES
                  </div>
                )}
              </Panel>
            </div>
          </div>

          {memResult && (
            <>
              <Panel title="Side-by-Side Memory Partition Layouts" code="RAM-CMP" brackets>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {selectedMemAlgos.map((algo) => {
                    const detail = memResult.results?.[algo];
                    const row = memResult.comparison_table.find((r) => r.algorithm === algo);
                    if (!detail || !row) return null;
                    const blocks = detail.remaining_blocks || [];
                    const total = blocks.reduce((a: number, b: any) => a + b.size, 0);
                    const allocMap: Record<string, string> = {};
                    (detail.allocations || []).forEach((al: any) => {
                      allocMap[al.block_id] = al.pid;
                    });
                    return (
                      <div key={algo} className="p-3 bg-[#080B0D] border border-[#1C252C] rounded-[2px] space-y-2.5 font-mono">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#E6EDF3]">{algo}</span>
                          <button
                            onClick={() => handleInspectTrace(algo, detail.trace_events || [])}
                            className="px-2 py-0.5 bg-[#0F2430] border border-[#1E4B63] text-[#38BDF8] text-[10px] rounded-[2px] cursor-pointer"
                          >
                            TRACE ({detail.trace_events?.length || 0})
                          </button>
                        </div>

                        <div className="space-y-1">
                          {blocks.map((b: any, i: number) => {
                            const isAlloc = b.status === "ALLOCATED";
                            return (
                              <div key={i} className="flex items-center gap-2 text-[10px]">
                                <span className="w-8 text-[#53616E]">{b.id}</span>
                                <div className="flex-1 h-6 bg-[#050708] border border-[#1C252C] rounded-[1px] overflow-hidden flex items-center">
                                  <div
                                    style={{ width: `${Math.max(12, (b.size / Math.max(1, total)) * 100)}%` }}
                                    className={`h-full flex items-center px-2 ${
                                      isAlloc ? "bg-[#0F2430] text-[#38BDF8]" : "bg-[#12271B]/60 text-[#4ADE80]"
                                    }`}
                                  >
                                    {isAlloc ? allocMap[b.id] || "USED" : "FREE"} ({b.size}MB)
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex justify-between text-[10px] pt-1 border-t border-[#141B21]">
                          <span className="text-[#4ADE80]">Placed: {row.successful_allocations}</span>
                          <span className="text-[#F59E0B]">Frag: {row.fragmentation}MB</span>
                          <span className="text-[#F87171]">Fail: {row.unallocated_count}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            </>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* ARENA 3: DISK SCHEDULING                                            */}
      {/* =================================================================== */}
      {arena === "DISK" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5">
              <Panel
                title="Shared Disk Head & Track Queue"
                code="INPUT"
                brackets
                actions={
                  <button
                    onClick={() => {
                      setDiskHead(53);
                      setDiskSize(200);
                      setDiskRequestsInput("98, 183, 37, 122, 14, 124, 65, 67");
                    }}
                    className="px-2 py-0.5 bg-[#11161B] border border-[#1C252C] text-[#38BDF8] font-mono text-[10px] rounded-[2px] cursor-pointer"
                  >
                    Standard Preset
                  </button>
                }
              >
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex flex-wrap gap-1.5 pb-2 border-b border-[#141B21]">
                    {DISK_ALGOS.map((a) => {
                      const on = selectedDiskAlgos.includes(a);
                      return (
                        <button
                          key={a}
                          onClick={() => toggleSelection(selectedDiskAlgos, setSelectedDiskAlgos, a)}
                          className={cn(
                            "px-2 py-1 text-[10px] rounded-[2px] border cursor-pointer",
                            on
                              ? "bg-[#0F2430] border-[#1E4B63] text-[#38BDF8] font-bold"
                              : "bg-[#080B0D] border-[#1C252C] text-[#53616E]"
                          )}
                        >
                          {a}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9px] text-[#8B98A5] block mb-1">HEAD POS</label>
                      <input
                        type="number"
                        min={0}
                        max={diskSize - 1}
                        value={diskHead}
                        onChange={(e) => setDiskHead(Number(e.target.value))}
                        className="w-full h-8 bg-[#080B0D] border border-[#1C252C] px-2 text-[#E6EDF3] rounded-[2px]"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-[#8B98A5] block mb-1">DISK TRACKS</label>
                      <input
                        type="number"
                        min={50}
                        max={1000}
                        value={diskSize}
                        onChange={(e) => setDiskSize(Number(e.target.value))}
                        className="w-full h-8 bg-[#080B0D] border border-[#1C252C] px-2 text-[#E6EDF3] rounded-[2px]"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-[#8B98A5] block mb-1">DIRECTION</label>
                      <select
                        value={diskDirection}
                        onChange={(e) => setDiskDirection(e.target.value as any)}
                        className="w-full h-8 bg-[#080B0D] border border-[#1C252C] px-2 text-[#E6EDF3] rounded-[2px]"
                      >
                        <option value="RIGHT">RIGHT</option>
                        <option value="LEFT">LEFT</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] text-[#8B98A5] block mb-1">
                      CYLINDER REQUEST QUEUE ({parsedDiskRequests.length} valid tracks)
                    </label>
                    <input
                      type="text"
                      value={diskRequestsInput}
                      onChange={(e) => setDiskRequestsInput(e.target.value)}
                      className="w-full h-8 bg-[#080B0D] border border-[#1C252C] px-2.5 text-[#E6EDF3] rounded-[2px]"
                    />
                  </div>

                  <button
                    onClick={handleRunBattle}
                    disabled={loading}
                    className="w-full h-9 bg-[#12271B] hover:bg-[#183525] border border-[#265438] text-[#4ADE80] font-bold rounded-[2px] flex items-center justify-center gap-2 uppercase tracking-wider cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{loading ? "SIMULATING..." : "RUN DISK BATTLE"}</span>
                  </button>
                </div>
              </Panel>
            </div>

            <div className="lg:col-span-7">
              <Panel
                title="Seek Trajectory Insights"
                code="INSIGHTS"
                brackets
                actions={
                  <select
                    value={diskMetric}
                    onChange={(e) => setDiskMetric(e.target.value as any)}
                    className="h-7 bg-[#080B0D] border border-[#1C252C] px-2 font-mono text-[10px] text-[#E6EDF3] rounded-[2px]"
                  >
                    <option value="total_head_movement">Metric: Total Head Movement</option>
                    <option value="average_seek_distance">Metric: Avg Seek Distance</option>
                    <option value="direction_changes">Metric: Direction Reversals</option>
                  </select>
                }
                className="h-full"
              >
                {diskInsights && diskResult ? (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <MetricDisplay
                        label={`LEADER (${diskInsights.metricLabel})`}
                        value={diskInsights.winner.algorithm}
                        sublabel={`${diskInsights.winner[diskMetric]} ${diskMetric === "direction_changes" ? "reversals" : "cyl"}`}
                        accent="green"
                      />
                      <MetricDisplay
                        label="SAVINGS VS TRAILING"
                        value={diskInsights.delta}
                        unit={diskMetric === "direction_changes" ? "turns" : "cyl"}
                        sublabel={`vs ${diskInsights.trailing.algorithm}`}
                        accent="cyan"
                      />
                      <MetricDisplay
                        label="LONGEST SINGLE SEEK"
                        value={diskInsights.maxSeek}
                        unit="cyl"
                        sublabel={
                          diskInsights.maxSeekTarget !== null
                            ? `Track ${diskInsights.maxSeekTarget} in ${diskInsights.trailing.algorithm}`
                            : "—"
                        }
                        accent="amber"
                      />
                    </div>
                    <div className="p-3 bg-[#080B0D] border border-[#1C252C] rounded-[2px] space-y-2 text-[11px] leading-relaxed">
                      <p className="text-[#E6EDF3]">
                        <strong>{diskInsights.winner.algorithm}</strong> minimized{" "}
                        {diskInsights.metricLabel.toLowerCase()} ({diskInsights.winner[diskMetric]}), saving{" "}
                        {diskInsights.delta} compared to {diskInsights.trailing.algorithm}.
                      </p>
                      <p className="text-[#8B98A5]">{diskInsights.tradeoffNote}</p>
                      <p className="text-[#38BDF8] text-[10px]">{diskInsights.workloadNote}</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center py-14 font-mono text-xs text-[#53616E]">
                    EXECUTE DISK BATTLE TO COMPARE HEAD TRAJECTORIES
                  </div>
                )}
              </Panel>
            </div>
          </div>

          {diskResult && diskInsights && (
            <>
              <Panel title="Side-by-Side Head Trajectory Charts" code="SEEK-CMP" brackets>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {diskInsights.rows.map((row) => {
                    const detail = diskResult.results?.[row.algorithm];
                    const path: number[] = detail?.movement_path || [];
                    const isLeader = row.algorithm === diskInsights.winner.algorithm;
                    const w = 420;
                    const h = 130;
                    const px = 18;
                    const py = 18;
                    const maxTrk = Math.max(1, diskSize - 1);
                    return (
                      <div
                        key={row.algorithm}
                        className={cn(
                          "battle-card p-3 bg-[#080B0D] border rounded-[2px] space-y-2 font-mono",
                          isLeader ? "border-[#265438]" : "border-[#1C252C]"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#E6EDF3]">{row.algorithm}</span>
                            {isLeader && <Badge variant="green">LEADER</Badge>}
                          </div>
                          <div className="flex items-center gap-2 text-[10px]">
                            <span className="text-[#4ADE80]">{row.total_head_movement} cyl</span>
                            <button
                              onClick={() => handleInspectTrace(row.algorithm, detail?.trace_events || [])}
                              className="px-2 py-0.5 bg-[#0F2430] border border-[#1E4B63] text-[#38BDF8] rounded-[2px] cursor-pointer"
                            >
                              TRACE ({detail?.trace_events?.length || 0})
                            </button>
                          </div>
                        </div>

                        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32 bg-[#050708] border border-[#1C252C] rounded-[2px]">
                          {path.length > 1 && (
                            <polyline
                              fill="none"
                              stroke={isLeader ? "#3ECF72" : "#38BDF8"}
                              strokeWidth="1.8"
                              points={path
                                .map((trk, idx) => {
                                  const x = px + (trk / maxTrk) * (w - px * 2);
                                  const y = py + (idx / Math.max(1, path.length - 1)) * (h - py * 2);
                                  return `${x},${y}`;
                                })
                                .join(" ")}
                            />
                          )}
                          {path.map((trk, idx) => {
                            const x = px + (trk / maxTrk) * (w - px * 2);
                            const y = py + (idx / Math.max(1, path.length - 1)) * (h - py * 2);
                            return (
                              <circle
                                key={idx}
                                cx={x}
                                cy={y}
                                r={idx === 0 ? 3.5 : 2.5}
                                fill={idx === 0 ? "#F59E0B" : isLeader ? "#3ECF72" : "#38BDF8"}
                              />
                            );
                          })}
                        </svg>

                        <div className="flex justify-between text-[10px] text-[#8B98A5]">
                          <span>Avg Seek: {row.average_seek_distance} cyl</span>
                          <span>Dir Changes: {row.direction_changes}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            </>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* SHARED EXECUTION TRACE INSPECTOR FOR SELECTED BATTLE ALGORITHM      */}
      {/* =================================================================== */}
      {inspectedAlgo && inspectedTrace.length > 0 && (
        <Panel
          title={`Algorithm Trace Inspector // ${arena} · ${inspectedAlgo}`}
          code="TRACE-LAB"
          brackets
          actions={
            <div className="flex items-center gap-2 font-mono text-[10px] text-[#4ADE80]">
              <Activity className="w-3.5 h-3.5" />
              <span>{inspectedTrace.length} DECISION STEPS</span>
            </div>
          }
        >
          <div className="space-y-3">
            <ExecutionPlayer
              traceEvents={inspectedTrace}
              currentStep={currentStep}
              onStepChange={setCurrentStep}
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
              speed={playbackSpeed}
              setSpeed={setPlaybackSpeed}
              moduleName={`${arena} · ${inspectedAlgo}`}
            />
            <ExecutionTimeline
              traceEvents={inspectedTrace}
              currentStep={currentStep}
              onSelectStep={setCurrentStep}
            />
            <DecisionInspector
              event={inspectedTrace[currentStep] || null}
              stepNumber={currentStep + 1}
              totalSteps={inspectedTrace.length}
            />
          </div>
        </Panel>
      )}
    </div>
  );
}
