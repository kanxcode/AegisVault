import { useEffect, useState } from "react";
import {
  Panel,
  Badge,
  MetricDisplay,
  ChartContainer,
  StatusIndicator,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  EmptyState,
} from "@/components/ui";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { Server } from "lucide-react";
import type { ExecutionHistoryItem } from "@/types/trace";

export default function SystemMonitor() {
  const {
    cpuUtilization,
    memoryUtilization,
    telemetryHistory,
    processes,
    diskQueueCount,
    activeTxCount,
    backendConnected,
    dbConnected,
    dbInfo,
    settings,
    fetchSystemMetrics,
    fetchProcesses,
  } = useStore();

  const [executions, setExecutions] = useState<ExecutionHistoryItem[]>([]);

  useEffect(() => {
    const refresh = () => {
      fetchSystemMetrics();
      fetchProcesses();
      api
        .getExecutionHistory("ALL", 6)
        .then((res) => Array.isArray(res) && setExecutions(res))
        .catch(() => { });
    };
    refresh();
    if (settings.pollingIntervalMs <= 0) return;
    const interval = setInterval(refresh, settings.pollingIntervalMs);
    return () => clearInterval(interval);
  }, [fetchSystemMetrics, fetchProcesses, settings.pollingIntervalMs]);

  const isOnline = backendConnected === true;
  const activeProcCount = processes.filter((p) => p.state !== "TERMINATED").length;
  const latestSample = telemetryHistory[telemetryHistory.length - 1];

  return (
    <div className="flex flex-col gap-4 max-w-[1440px] mx-auto pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1C252C] pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#12271B] border border-[#265438] text-[#4ADE80] rounded-[2px]">
              MON-03
            </span>
            <Server className="w-4 h-4 text-[#3ECF72]" />
            <h1 className="font-display text-xl font-bold tracking-[0.08em] text-[#E6EDF3] uppercase">
              System Telemetry Monitor
            </h1>
          </div>
          <p className="font-mono text-[10px] text-[#8B98A5] tracking-widest uppercase">
            Resource Telemetry • Process Counts • Database Health • Execution Activity
          </p>
        </div>

        <StatusIndicator
          tone={isOnline ? "online" : "offline"}
          label={isOnline ? "TELEMETRY STREAM ACTIVE" : "TELEMETRY OFFLINE"}
          pulse={isOnline}
        />
      </div>

      {/* Resource Telemetry Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricDisplay
          label="CPU LOAD"
          value={cpuUtilization !== null ? cpuUtilization.toFixed(1) : "—"}
          unit="%"
          unavailable={!isOnline || cpuUtilization === null}
          progress={cpuUtilization ?? 0}
          accent="green"
          sublabel={`${activeProcCount} active processes`}
        />
        <MetricDisplay
          label="MEMORY USAGE"
          value={memoryUtilization !== null ? memoryUtilization.toFixed(1) : "—"}
          unit="%"
          unavailable={!isOnline || memoryUtilization === null}
          progress={memoryUtilization ?? 0}
          accent="cyan"
          sublabel="Derived from RAM partition map"
        />
        <MetricDisplay
          label="THERMAL INDEX"
          value={latestSample?.temp !== undefined ? latestSample.temp : "—"}
          unit="°C"
          unavailable={!isOnline || latestSample?.temp === undefined}
          progress={latestSample?.temp ?? 0}
          accent="amber"
          sublabel="Simulated thermal sensor"
        />
        <MetricDisplay
          label="BUS THROUGHPUT"
          value={latestSample?.network !== undefined ? latestSample.network : "—"}
          unit="KB/s"
          unavailable={!isOnline || latestSample?.network === undefined}
          accent="neutral"
          sublabel={`${activeTxCount} active DB txns · ${diskQueueCount} disk I/O`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartContainer
          title="Compute & Memory Telemetry"
          code="SYS-CPU"
          legend={[
            { label: "CPU %", color: "#3ECF72" },
            { label: "Memory %", color: "#38BDF8" },
          ]}
          heightClass="h-[300px]"
        >
          {isOnline && telemetryHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={telemetryHistory} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
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
                <Line type="monotone" dataKey="cpu" stroke="#3ECF72" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="memory" stroke="#38BDF8" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              title="TELEMETRY UNAVAILABLE"
              description="Waiting for active backend telemetry stream."
              className="h-full border-none"
            />
          )}
        </ChartContainer>

        <ChartContainer
          title="Bus & Network I/O Throughput"
          code="SYS-NET"
          legend={[{ label: "KB/s", color: "#F59E0B" }]}
          heightClass="h-[300px]"
        >
          {isOnline && telemetryHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={telemetryHistory} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1C252C" vertical={false} />
                <XAxis dataKey="time" stroke="#53616E" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#53616E" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#080B0D",
                    border: "1px solid #2A3844",
                    borderRadius: "2px",
                    fontSize: "11px",
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                />
                <Line type="stepAfter" dataKey="network" stroke="#F59E0B" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              title="THROUGHPUT UNAVAILABLE"
              description="Waiting for active backend telemetry stream."
              className="h-full border-none"
            />
          )}
        </ChartContainer>
      </div>

      {/* Database Status & Recent Execution Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4">
          <Panel title="Database Engine Status" code="DB-MON" brackets>
            <div className="space-y-2.5 font-mono text-xs">
              <div className="flex justify-between py-1.5 border-b border-[#141B21]">
                <span className="text-[#53616E]">CONNECTION</span>
                <Badge variant={dbConnected ? "green" : "red"} dot>
                  {dbConnected ? "CONNECTED" : "OFFLINE"}
                </Badge>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#141B21]">
                <span className="text-[#53616E]">DIALECT</span>
                <span className="text-[#38BDF8] font-bold">{dbInfo?.dialect || "UNAVAILABLE"}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#141B21]">
                <span className="text-[#53616E]">CATALOG</span>
                <span className="text-[#E6EDF3]">{dbInfo?.database_name || "—"}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#141B21]">
                <span className="text-[#53616E]">TABLES / ROWS</span>
                <span className="text-[#E6EDF3]">
                  {dbInfo ? `${dbInfo.total_tables} / ${dbInfo.total_records}` : "—"}
                </span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[#53616E]">QUERY LATENCY</span>
                <span className="text-[#4ADE80]">{dbInfo ? `${dbInfo.latency_ms} ms` : "—"}</span>
              </div>
            </div>
          </Panel>
        </div>

        <div className="lg:col-span-8">
          <Panel title="Recent Simulation Execution Activity" code="EXEC" noPadding>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>EXECUTION ID</TableHead>
                  <TableHead>MODULE</TableHead>
                  <TableHead>ALGORITHM</TableHead>
                  <TableHead className="text-right">STEPS</TableHead>
                  <TableHead>TIMESTAMP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executions.length > 0 ? (
                  executions.map((ex) => (
                    <TableRow key={ex.execution_id}>
                      <TableCell className="text-[#38BDF8] font-bold">{ex.execution_id}</TableCell>
                      <TableCell className="text-[#8B98A5] uppercase">{ex.module}</TableCell>
                      <TableCell className="text-[#4ADE80]">{ex.algorithm}</TableCell>
                      <TableCell className="text-right">{ex.total_steps}</TableCell>
                      <TableCell className="text-[#8B98A5]">{ex.created_at}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-[#53616E]">
                      NO RECENT EXECUTION ACTIVITY RECORDED
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
