import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { animate, stagger } from "animejs";
import { shouldReduceMotion, useScrollProgress } from "@/lib/motion";

const OrbitalComputeBackdrop = lazy(() => import("@/components/three/OrbitalComputeBackdrop"));
import {
  Activity,
  Cpu,
  Database,
  HardDrive,
  MemoryStick,
  Swords,
  TerminalSquare,
  ScrollText,
  ArrowUpRight,
  Layers,
  FolderTree,
  GitCommitHorizontal,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  Panel,
  Badge,
  MetricDisplay,
  StatusIndicator,
  ChartContainer,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  EmptyState,
} from "@/components/ui";
import { AegisInsignia } from "@/components/layout/AegisInsignia";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";
import type { ExecutionHistoryItem } from "@/types/trace";

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    cpuUtilization,
    memoryUtilization,
    processes,
    events,
    diskQueueCount,
    activeTxCount,
    telemetryHistory,
    memoryBlocks,
    diskRequests,
    backendConnected,
    backendLatencyMs,
    dbConnected,
    dbInfo,
    activeExecution,
    isExecutingSimulation,
    getSystemState,
    settings,
    fetchSystemMetrics,
    fetchEvents,
    fetchProcesses,
    fetchMemoryBlocks,
    fetchDiskRequests,
  } = useStore();

  const [recentExecutions, setRecentExecutions] = useState<ExecutionHistoryItem[]>([]);
  const dashRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScrollProgress();

  useEffect(() => {
    if (shouldReduceMotion() || !dashRef.current) return;
    const targets = dashRef.current.querySelectorAll(".dash-stagger");
    if (targets.length === 0) return;
    const anim = animate(targets, {
      opacity: [0, 1],
      translateY: [10, 0],
      delay: stagger(45),
      duration: 360,
      ease: "outExpo",
    });
    return () => {
      anim.pause();
    };
  }, []);

  useEffect(() => {
    const loadAll = () => {
      fetchSystemMetrics();
      fetchEvents({ limit: 10 });
      fetchProcesses();
      fetchMemoryBlocks();
      fetchDiskRequests();
      api
        .getExecutionHistory("ALL", 6)
        .then((res) => {
          if (Array.isArray(res)) setRecentExecutions(res);
        })
        .catch(() => { });
    };
    loadAll();

    if (settings.pollingIntervalMs <= 0) return;
    const interval = setInterval(loadAll, settings.pollingIntervalMs);
    return () => clearInterval(interval);
  }, [
    fetchSystemMetrics,
    fetchEvents,
    fetchProcesses,
    fetchMemoryBlocks,
    fetchDiskRequests,
    settings.pollingIntervalMs,
  ]);

  const sysState = getSystemState();
  const isOnline = backendConnected === true;
  const activeProcCount = processes.filter((p) => p.state !== "TERMINATED").length;

  const stateCounts = {
    READY: processes.filter((p) => p.state === "READY").length,
    RUNNING: processes.filter((p) => p.state === "RUNNING").length,
    WAITING: processes.filter((p) => p.state === "WAITING").length,
    TERMINATED: processes.filter((p) => p.state === "TERMINATED").length,
  };

  const totalMemMB = memoryBlocks.reduce((acc, b) => acc + (b.size || 0), 0);
  const usedMemMB = memoryBlocks
    .filter((b) => b.status === "ALLOCATED")
    .reduce((acc, b) => acc + (b.size || 0), 0);

  const pendingDiskCount = diskRequests.filter((r) => r.status === "PENDING").length;
  const servicedDiskCount = diskRequests.filter((r) => r.status === "SERVICED").length;

  const quickModules = [
    { label: "Algorithm Battle Lab", code: "LAB", path: "/analytics/battle-lab", icon: Swords, accent: "text-[#38BDF8]" },
    { label: "CPU Scheduler", code: "CPU", path: "/os/scheduler", icon: Cpu, accent: "text-[#4ADE80]" },
    { label: "Process Manager", code: "PRC", path: "/os/processes", icon: Activity, accent: "text-[#4ADE80]" },
    { label: "Memory Manager", code: "MEM", path: "/os/memory", icon: MemoryStick, accent: "text-[#38BDF8]" },
    { label: "Paging & MMU", code: "MMU", path: "/os/paging", icon: Layers, accent: "text-[#38BDF8]" },
    { label: "Disk Scheduler", code: "DSK", path: "/os/disk", icon: HardDrive, accent: "text-[#F59E0B]" },
    { label: "File Manager", code: "VFS", path: "/os/files", icon: FolderTree, accent: "text-[#8B98A5]" },
    { label: "DBMS Explorer", code: "DBM", path: "/db/explorer", icon: Database, accent: "text-[#4ADE80]" },
    { label: "SQL Console", code: "SQL", path: "/db/sql", icon: TerminalSquare, accent: "text-[#38BDF8]" },
    { label: "Transactions", code: "TRX", path: "/db/transactions", icon: GitCommitHorizontal, accent: "text-[#F59E0B]" },
  ];

  return (
    <div ref={dashRef} className="flex flex-col gap-5 max-w-[1440px] mx-auto pb-10">
      {/* CINEMATIC COMMAND CENTRE HERO WITH 3D ORBITAL COMPUTE BACKDROP */}
      <section className="dash-stagger bg-[#0C1013] border border-[#1C252C] rounded-[2px] p-5 md:p-6 aegis-brackets relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ transform: `translateY(${Math.min(20, scrollY * 0.08)}px)` }}
        >
          <Suspense fallback={null}>
            <OrbitalComputeBackdrop />
          </Suspense>
        </div>
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <AegisInsignia className="w-12 h-12 mt-0.5" />
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-[10px] px-2 py-0.5 bg-[#12271B] border border-[#265438] text-[#4ADE80] rounded-[2px] tracking-[0.18em] uppercase">
                  CMD-00 // COMMAND CENTRE
                </span>
                <StatusIndicator
                  tone={
                    sysState === "NOMINAL"
                      ? "online"
                      : sysState === "EXECUTING"
                        ? "executing"
                        : sysState === "DEGRADED"
                          ? "degraded"
                          : sysState === "OFFLINE"
                            ? "offline"
                            : "idle"
                  }
                  label={`OPERATIONAL STATE: ${sysState}`}
                  pulse={sysState === "NOMINAL" || sysState === "EXECUTING"}
                />
              </div>
              <h1 className="font-display text-2xl md:text-3xl font-bold tracking-[0.08em] text-[#E6EDF3] uppercase">
                AEGISVAULT SYSTEMS CONTROL
              </h1>
              <p className="font-mono text-xs text-[#8B98A5] tracking-wide max-w-2xl">
                Deterministic OS Kernel Simulation, Relational Database Engine &amp; Multi-Algorithm Comparative Laboratory
              </p>
            </div>
          </div>

          {/* Real Connectivity & Active Execution Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 lg:min-w-[460px]">
            <div className="bg-[#080B0D] border border-[#1C252C] p-3 rounded-[2px] font-mono">
              <div className="text-[9px] text-[#53616E] tracking-widest uppercase">BACKEND API</div>
              <div className="flex items-center justify-between mt-1">
                <span className={isOnline ? "text-xs font-bold text-[#4ADE80]" : "text-xs font-bold text-[#F87171]"}>
                  {backendConnected === null ? "PROBING..." : isOnline ? "CONNECTED" : "OFFLINE"}
                </span>
                <span className="text-[10px] text-[#8B98A5] tabular-nums">
                  {backendLatencyMs !== null ? `${backendLatencyMs}ms` : "—"}
                </span>
              </div>
            </div>

            <div className="bg-[#080B0D] border border-[#1C252C] p-3 rounded-[2px] font-mono">
              <div className="text-[9px] text-[#53616E] tracking-widest uppercase">DATABASE ENGINE</div>
              <div className="flex items-center justify-between mt-1">
                <span className={dbConnected ? "text-xs font-bold text-[#38BDF8]" : "text-xs font-bold text-[#F87171]"}>
                  {dbConnected === null ? "CHECKING" : dbConnected ? dbInfo?.dialect || "ONLINE" : "UNAVAILABLE"}
                </span>
                <span className="text-[10px] text-[#8B98A5] truncate max-w-[90px]">
                  {dbInfo?.database_name || "—"}
                </span>
              </div>
            </div>

            <div className="bg-[#080B0D] border border-[#1C252C] p-3 rounded-[2px] font-mono">
              <div className="text-[9px] text-[#53616E] tracking-widest uppercase">ACTIVE SIMULATION</div>
              <div className="flex items-center justify-between mt-1">
                <span className={isExecutingSimulation ? "text-xs font-bold text-[#38BDF8]" : "text-xs font-bold text-[#E6EDF3]"}>
                  {isExecutingSimulation ? "EXECUTING" : activeExecution ? "LAST TRACE" : "STANDBY"}
                </span>
                <span className="text-[10px] text-[#4ADE80] truncate max-w-[90px]">
                  {activeExecution ? activeExecution.algorithm : "IDLE"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Strip */}
        <div className="relative z-10 mt-5 pt-4 border-t border-[#141B21] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-[#8B98A5]">
            {isOnline ? (
              <span className="flex items-center gap-1.5 text-[#4ADE80]">
                <ShieldCheck className="w-3.5 h-3.5" />
                Live telemetry stream verified against FastAPI backend
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[#F59E0B]">
                <AlertTriangle className="w-3.5 h-3.5" />
                Backend unreachable at localhost:8000 — unavailable metrics marked explicitly
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/analytics/battle-lab")}
              className="h-8 px-3.5 bg-[#0F2430] hover:bg-[#143242] border border-[#1E4B63] text-[#38BDF8] font-mono text-xs font-semibold rounded-[2px] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Swords className="w-3.5 h-3.5" />
              <span>LAUNCH BATTLE LAB</span>
            </button>
            <button
              onClick={() => navigate("/terminal")}
              className="h-8 px-3.5 bg-[#12271B] hover:bg-[#183525] border border-[#265438] text-[#4ADE80] font-mono text-xs font-semibold rounded-[2px] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <TerminalSquare className="w-3.5 h-3.5" />
              <span>COMMAND CONSOLE</span>
            </button>
          </div>
        </div>
      </section>

      {/* SUBSYSTEM TELEMETRY METRICS */}
      <div className="dash-stagger grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <MetricDisplay
          label="CPU UTILIZATION"
          value={cpuUtilization !== null ? cpuUtilization.toFixed(1) : "—"}
          unit="%"
          unavailable={!isOnline || cpuUtilization === null}
          status={cpuUtilization !== null && cpuUtilization > 85 ? "ELEVATED" : "NOMINAL"}
          variant={cpuUtilization !== null && cpuUtilization > 85 ? "amber" : "green"}
          accent={cpuUtilization !== null && cpuUtilization > 85 ? "amber" : "green"}
          progress={cpuUtilization ?? 0}
          sublabel={`${stateCounts.RUNNING} running · ${stateCounts.READY} ready`}
        />
        <MetricDisplay
          label="MEMORY ALLOCATION"
          value={memoryUtilization !== null ? memoryUtilization.toFixed(1) : "—"}
          unit="%"
          unavailable={!isOnline || memoryUtilization === null}
          status={memoryUtilization !== null && memoryUtilization > 85 ? "HIGH" : "NOMINAL"}
          variant={memoryUtilization !== null && memoryUtilization > 85 ? "amber" : "cyan"}
          accent="cyan"
          progress={memoryUtilization ?? 0}
          sublabel={totalMemMB > 0 ? `${usedMemMB} / ${totalMemMB} MB allocated` : "No partition map"}
        />
        <MetricDisplay
          label="ACTIVE PROCESSES"
          value={activeProcCount.toString().padStart(2, "0")}
          unavailable={!isOnline}
          status={isOnline ? "TRACKED" : "OFFLINE"}
          variant="green"
          accent="green"
          sublabel={`${processes.length} total in PCB registry`}
        />
        <MetricDisplay
          label="DISK I/O QUEUE"
          value={diskQueueCount.toString().padStart(2, "0")}
          unavailable={!isOnline}
          status={diskQueueCount > 0 ? "PENDING" : "IDLE"}
          variant={diskQueueCount > 0 ? "amber" : "gray"}
          accent={diskQueueCount > 0 ? "amber" : "neutral"}
          sublabel={`${pendingDiskCount} pending · ${servicedDiskCount} serviced`}
        />
        <MetricDisplay
          label="DB TRANSACTIONS"
          value={activeTxCount.toString().padStart(2, "0")}
          unavailable={!isOnline}
          status={activeTxCount > 0 ? "ACTIVE" : "IDLE"}
          variant={activeTxCount > 0 ? "cyan" : "gray"}
          accent={activeTxCount > 0 ? "cyan" : "neutral"}
          sublabel={dbInfo ? `${dbInfo.total_tables} tables · ${dbInfo.total_records} rows` : "DB unavailable"}
        />
      </div>

      {/* MIDDLE GRID: TELEMETRY CHART + RECENT EXECUTIONS */}
      <div className="dash-stagger grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5">
          <ChartContainer
            title="Subsystem Compute & Memory Telemetry"
            code="TEL-01"
            subtitle={isOnline ? "Sampled from /api/system/metrics" : "Telemetry feed offline"}
            legend={[
              { label: "CPU %", color: "#3ECF72" },
              { label: "MEM %", color: "#38BDF8" },
            ]}
            heightClass="h-[260px]"
          >
            {isOnline && telemetryHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={telemetryHistory} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1C252C" vertical={false} />
                  <XAxis dataKey="time" stroke="#53616E" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} stroke="#53616E" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#080B0D",
                      border: "1px solid #2A3844",
                      borderRadius: "2px",
                      fontSize: "11px",
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                  />
                  <Line type="stepAfter" dataKey="cpu" stroke="#3ECF72" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="stepAfter" dataKey="memory" stroke="#38BDF8" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title={isOnline ? "AWAITING TELEMETRY SAMPLES" : "TELEMETRY UNAVAILABLE"}
                description={isOnline ? "Telemetry points will appear on next poll." : "Start the FastAPI backend on port 8000 to stream live metrics."}
                className="h-full border-none"
              />
            )}
          </ChartContainer>
        </div>

        <div className="lg:col-span-7">
          <Panel
            title="Recent Execution Traces"
            code="TRC-02"
            subtitle="Deterministic simulation audit history"
            actions={
              <button
                onClick={() => navigate("/logs")}
                className="font-mono text-[10px] text-[#38BDF8] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>ALL TRACES</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            }
            noPadding
            className="h-full"
          >
            {recentExecutions.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>EXEC ID</TableHead>
                    <TableHead>MODULE</TableHead>
                    <TableHead>ALGORITHM</TableHead>
                    <TableHead className="text-right">STEPS</TableHead>
                    <TableHead>STATUS</TableHead>
                    <TableHead className="text-right">ACTION</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentExecutions.map((ex) => (
                    <TableRow key={ex.execution_id}>
                      <TableCell className="text-[#38BDF8] font-semibold">
                        {ex.execution_id.slice(-12)}
                      </TableCell>
                      <TableCell className="text-[#8B98A5] uppercase">{ex.module}</TableCell>
                      <TableCell className="text-[#E6EDF3] font-semibold">{ex.algorithm}</TableCell>
                      <TableCell className="text-right">{ex.total_steps}</TableCell>
                      <TableCell>
                        <Badge variant={ex.status === "COMPLETED" || ex.status === "SUCCESS" ? "green" : "amber"}>
                          {ex.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          onClick={() => navigate(`/logs?exec=${encodeURIComponent(ex.execution_id)}`)}
                          className="px-2 py-0.5 bg-[#11161B] hover:bg-[#171E24] border border-[#1C252C] text-[#4ADE80] text-[10px] rounded-[2px] cursor-pointer"
                        >
                          REPLAY
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-4">
                <EmptyState
                  title="NO EXECUTION RECORDS"
                  description="Run a CPU, Memory, Disk, Paging, or DBMS simulation to record observable execution traces."
                />
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* LOWER ROW: PROCESS TOPOLOGY + QUICK MODULE LAUNCH + RECENT EVENTS */}
      <div className="dash-stagger grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Process State Topology + Quick Module Access */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <Panel title="Process Lifecycle Distribution" code="PRC-STAT">
            <div className="grid grid-cols-2 gap-3.5 py-1">
              {[
                { label: "RUNNING", count: stateCounts.RUNNING, color: "bg-[#3ECF72]", text: "text-[#4ADE80]" },
                { label: "READY", count: stateCounts.READY, color: "bg-[#38BDF8]", text: "text-[#38BDF8]" },
                { label: "WAITING", count: stateCounts.WAITING, color: "bg-[#F59E0B]", text: "text-[#F59E0B]" },
                { label: "TERMINATED", count: stateCounts.TERMINATED, color: "bg-[#EF4444]", text: "text-[#F87171]" },
              ].map((s) => (
                <div key={s.label} className="bg-[#080B0D] border border-[#1C252C] p-2.5 rounded-[2px]">
                  <div className="flex justify-between font-mono text-[10px] mb-1.5">
                    <span className="text-[#8B98A5]">{s.label}</span>
                    <span className={`font-bold tabular-nums ${s.text}`}>
                      {s.count.toString().padStart(2, "0")}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[#11161B] rounded-[1px] overflow-hidden">
                    <div
                      className={`h-full ${s.color}`}
                      style={{
                        width: `${processes.length > 0 ? Math.max(s.count > 0 ? 10 : 0, (s.count / processes.length) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Module Quick Dispatch" code="NAV-GRID">
            <div className="grid grid-cols-2 gap-1.5">
              {quickModules.map((m) => (
                <button
                  key={m.path}
                  onClick={() => navigate(m.path)}
                  className="flex items-center justify-between px-2.5 py-2 bg-[#080B0D] hover:bg-[#11161B] border border-[#1C252C] hover:border-[#2A3844] rounded-[2px] font-mono text-xs text-left transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <m.icon className={`w-3.5 h-3.5 shrink-0 ${m.accent}`} />
                    <span className="text-[#C5D1DC] group-hover:text-[#E6EDF3] truncate text-[11px]">
                      {m.label}
                    </span>
                  </div>
                  <span className="text-[9px] text-[#53616E] group-hover:text-[#38BDF8]">{m.code}</span>
                </button>
              ))}
            </div>
          </Panel>
        </div>

        {/* Recent Event Stream */}
        <div className="lg:col-span-7">
          <Panel
            title="Live System Event Stream"
            code="EVT-LOG"
            actions={
              <button
                onClick={() => navigate("/logs")}
                className="font-mono text-[10px] text-[#4ADE80] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <ScrollText className="w-3 h-3" />
                <span>EVENT CONSOLE</span>
              </button>
            }
            noPadding
            className="h-full"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">TIME</TableHead>
                  <TableHead className="w-20">MOD</TableHead>
                  <TableHead className="w-40">EVENT</TableHead>
                  <TableHead>DESCRIPTION</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.slice(0, 8).map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell className="text-[#53616E] text-[11px]">{ev.timestamp}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          ev.severity === "ERROR"
                            ? "red"
                            : ev.severity === "WARNING"
                              ? "amber"
                              : "cyan"
                        }
                      >
                        {ev.module}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={
                        ev.severity === "ERROR"
                          ? "text-[#F87171] font-semibold text-[11px]"
                          : ev.severity === "WARNING"
                            ? "text-[#F59E0B] font-semibold text-[11px]"
                            : "text-[#E6EDF3] font-semibold text-[11px]"
                      }
                    >
                      {ev.event}
                    </TableCell>
                    <TableCell className="text-[#8B98A5] text-[11px] max-w-[300px] truncate">
                      {ev.description}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </div>
      </div>
    </div>
  );
}
