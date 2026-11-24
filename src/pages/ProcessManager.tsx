import { useState, useEffect } from "react";
import {
  Panel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  MetricDisplay,
  ConfirmDialog,
  type BadgeVariant,
} from "@/components/ui";
import { useStore } from "@/lib/store";
import type { Process, ProcessState } from "@/lib/simulation/mockData";
import {
  Plus,
  Search,
  TerminalSquare,
  Play,
  Pause,
  XCircle,
  RotateCcw,
  Check,
  ArrowRight,
  Activity,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { DecisionInspector } from "@/components/trace";
import type { TraceEvent } from "@/types/trace";

const getStateVariant = (state: ProcessState): BadgeVariant => {
  switch (state) {
    case "RUNNING":
      return "green";
    case "READY":
      return "cyan";
    case "WAITING":
      return "amber";
    case "TERMINATED":
      return "red";
    case "NEW":
    default:
      return "gray";
  }
};

export default function ProcessManager() {
  const {
    processes,
    fetchProcesses,
    createProcess,
    updateProcessState,
    deleteProcess,
    resetProcesses,
    setActiveExecution,
    pushNotification,
  } = useStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [stateFilter, setStateFilter] = useState("ALL");
  const [selectedProcess, setSelectedProcess] = useState<Process | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [lastTraceEvent, setLastTraceEvent] = useState<TraceEvent | null>(null);
  const [confirmKillPid, setConfirmKillPid] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const [newPid, setNewPid] = useState("");
  const [newName, setNewName] = useState("");
  const [newBurst, setNewBurst] = useState(40);
  const [newPriority, setNewPriority] = useState(1);
  const [newMemory, setNewMemory] = useState(256);

  useEffect(() => {
    fetchProcesses();
  }, [fetchProcesses]);

  useEffect(() => {
    if (processes.length > 0) {
      if (!selectedProcess || !processes.find((p) => p.id === selectedProcess.id)) {
        setSelectedProcess(processes[0]);
      } else {
        const updated = processes.find((p) => p.id === selectedProcess.id);
        if (updated) setSelectedProcess(updated);
      }
    } else {
      setSelectedProcess(null);
    }
  }, [processes]);

  const filteredProcesses = processes.filter((p) => {
    const matchesSearch =
      p.pid.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesState = stateFilter === "ALL" || p.state === stateFilter;
    return matchesSearch && matchesState;
  });

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPid.trim() || !newName.trim()) return;

    try {
      const res = await api.createProcess({
        pid: newPid.trim().toUpperCase(),
        name: newName.trim(),
        burst_time: Number(newBurst),
        priority: Number(newPriority),
        memory: Number(newMemory),
      });
      if (res?.trace_events?.length > 0) {
        setLastTraceEvent(res.trace_events[0]);
      }
      if (res?.execution_id) {
        setActiveExecution({
          execution_id: res.execution_id,
          module: "process_manager",
          algorithm: "PROCESS_LIFECYCLE",
          status: "COMPLETED",
          total_steps: res.trace_events?.length || 1,
        });
      }
      pushNotification({
        title: "PROCESS SPAWNED",
        message: `Allocated PCB for ${newPid.trim().toUpperCase()} (${newName.trim()})`,
        severity: "SUCCESS",
        module: "PROC",
      });
      fetchProcesses();
    } catch {
      await createProcess({
        pid: newPid.trim().toUpperCase(),
        name: newName.trim(),
        burst_time: Number(newBurst),
        priority: Number(newPriority),
        memory: Number(newMemory),
      });
    }

    setIsCreateModalOpen(false);
    setNewPid("");
    setNewName("");
  };

  const handleStateChange = async (targetPid: string, targetState: ProcessState) => {
    try {
      const res = await api.updateProcessState(targetPid, targetState);
      if (res?.trace_events?.length > 0) {
        setLastTraceEvent(res.trace_events[0]);
      }
      if (res?.execution_id) {
        setActiveExecution({
          execution_id: res.execution_id,
          module: "process_manager",
          algorithm: "STATE_TRANSITION",
          status: "COMPLETED",
          total_steps: res.trace_events?.length || 1,
        });
      }
      fetchProcesses();
    } catch {
      await updateProcessState(targetPid, targetState);
    }
  };

  const states: ProcessState[] = ["NEW", "READY", "RUNNING", "WAITING", "TERMINATED"];

  return (
    <div className="flex flex-col gap-4 max-w-[1440px] mx-auto pb-8">
      {/* Module Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1C252C] pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#12271B] border border-[#265438] text-[#4ADE80] rounded-[2px]">
              PRC-01
            </span>
            <Activity className="w-4 h-4 text-[#3ECF72]" />
            <h1 className="font-display text-xl font-bold tracking-[0.08em] text-[#E6EDF3] uppercase">
              Process Manager &amp; PCB Inspector
            </h1>
          </div>
          <p className="font-mono text-[10px] text-[#8B98A5] tracking-widest uppercase">
            Kernel Process Control Block Registry • State Machine Topology • Transition Rationale
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setConfirmReset(true)}
            className="h-8 px-3 bg-[#0C1013] hover:bg-[#171E24] border border-[#1C252C] text-[#8B98A5] hover:text-[#E6EDF3] font-mono text-xs rounded-[2px] flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>RESET REGISTRY</span>
          </button>
          <button
            onClick={() => {
              const nextPidNum = processes.length + 101;
              setNewPid(`P${nextPidNum}`);
              setNewName(`proc_daemon_${nextPidNum}`);
              setIsCreateModalOpen(true);
            }}
            className="h-8 px-3.5 bg-[#12271B] hover:bg-[#183525] border border-[#265438] text-[#4ADE80] font-mono text-xs font-bold rounded-[2px] flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>SPAWN PROCESS</span>
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricDisplay label="TOTAL PCBS" value={processes.length} accent="neutral" />
        <MetricDisplay
          label="RUNNING"
          value={processes.filter((p) => p.state === "RUNNING").length}
          accent="green"
        />
        <MetricDisplay
          label="READY QUEUE"
          value={processes.filter((p) => p.state === "READY").length}
          accent="cyan"
        />
        <MetricDisplay
          label="WAITING / I/O"
          value={processes.filter((p) => p.state === "WAITING").length}
          accent="amber"
        />
        <MetricDisplay
          label="TERMINATED"
          value={processes.filter((p) => p.state === "TERMINATED").length}
          accent="red"
        />
      </div>

      {/* State Transition Machine Topology */}
      <Panel
        title="Process State Machine Topology"
        code="FSM"
        subtitle={
          selectedProcess
            ? `Click any target state to transition ${selectedProcess.pid} (${selectedProcess.name})`
            : "Select a process below to trigger transitions"
        }
        brackets
      >
        <div className="flex flex-wrap items-center justify-between gap-2 py-1.5">
          {states.map((st, idx) => {
            const isCurrent = selectedProcess?.state === st;
            const count = processes.filter((p) => p.state === st).length;
            return (
              <div key={st} className="flex items-center gap-2 flex-1 min-w-[120px]">
                <button
                  onClick={() => selectedProcess && handleStateChange(selectedProcess.pid, st)}
                  disabled={!selectedProcess || isCurrent}
                  className={cn(
                    "w-full px-3 py-2.5 rounded-[2px] font-mono text-xs border transition-all cursor-pointer flex flex-col items-center gap-1",
                    isCurrent
                      ? "bg-[#12271B] border-[#3ECF72] text-[#4ADE80]"
                      : "bg-[#080B0D] border-[#1C252C] text-[#8B98A5] hover:border-[#2A3844] hover:text-[#E6EDF3] disabled:opacity-50"
                  )}
                >
                  <span className="font-bold tracking-wider">{st}</span>
                  <span className="text-[10px] text-[#53616E] tabular-nums">{count} tasks</span>
                </button>
                {idx < states.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-[#2A3844] hidden lg:block shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#53616E]" />
          <input
            type="text"
            placeholder="Search PID or process name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 w-64 bg-[#0C1013] border border-[#1C252C] rounded-[2px] pl-8 pr-2.5 text-xs text-[#E6EDF3] placeholder:text-[#53616E] focus:outline-none focus:border-[#3ECF72] font-mono"
          />
        </div>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="h-8 bg-[#0C1013] border border-[#1C252C] rounded-[2px] px-2.5 text-xs text-[#E6EDF3] focus:outline-none focus:border-[#3ECF72] font-mono cursor-pointer"
        >
          <option value="ALL">ALL STATES</option>
          <option value="NEW">NEW</option>
          <option value="RUNNING">RUNNING</option>
          <option value="READY">READY</option>
          <option value="WAITING">WAITING</option>
          <option value="TERMINATED">TERMINATED</option>
        </select>
      </div>

      {/* Registry + PCB Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-8">
          <Panel title="Active Process Registry" code="REG" noPadding className="min-h-[480px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PID</TableHead>
                  <TableHead>PROCESS</TableHead>
                  <TableHead>STATE</TableHead>
                  <TableHead className="text-right">ARRIVAL</TableHead>
                  <TableHead className="text-right">BURST</TableHead>
                  <TableHead className="text-right">PRI</TableHead>
                  <TableHead className="text-right">CPU</TableHead>
                  <TableHead className="text-right">MEM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProcesses.length > 0 ? (
                  filteredProcesses.map((process) => {
                    const isSelected = selectedProcess?.id === process.id;
                    return (
                      <TableRow
                        key={process.id}
                        onClick={() => setSelectedProcess(process)}
                        className={cn(
                          "cursor-pointer",
                          isSelected && "bg-[#12271B]/45 border-l-2 border-l-[#3ECF72]"
                        )}
                      >
                        <TableCell className="font-bold text-[#4ADE80]">{process.pid}</TableCell>
                        <TableCell>{process.name}</TableCell>
                        <TableCell>
                          <Badge variant={getStateVariant(process.state)} dot>
                            {process.state}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-[#8B98A5]">{process.arrivalTime} ms</TableCell>
                        <TableCell className="text-right">{process.burstTime} ms</TableCell>
                        <TableCell className="text-right text-[#F59E0B]">{process.priority}</TableCell>
                        <TableCell className="text-right text-[#38BDF8]">{process.cpuTime} ms</TableCell>
                        <TableCell className="text-right text-[#8B98A5]">{process.memory} MB</TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-[#53616E]">
                      NO MATCHING PROCESSES IN PCB REGISTRY
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Panel>
        </div>

        {/* PCB Inspector */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {selectedProcess && (
            <Panel title={`PCB Inspector // ${selectedProcess.pid}`} code="PCB" brackets>
              <div className="space-y-4 font-mono">
                <div className="flex items-center justify-between border-b border-[#141B21] pb-2.5">
                  <div className="flex items-center gap-2">
                    <TerminalSquare className="w-4 h-4 text-[#3ECF72]" />
                    <span className="text-sm font-bold text-[#E6EDF3]">{selectedProcess.pid}</span>
                    <span className="text-xs text-[#8B98A5]">({selectedProcess.name})</span>
                  </div>
                  <Badge variant={getStateVariant(selectedProcess.state)} dot>
                    {selectedProcess.state}
                  </Badge>
                </div>

                {/* Simulated Hardware Context */}
                <div className="bg-[#080B0D] p-2.5 border border-[#1C252C] rounded-[2px] text-[10px] space-y-1.5">
                  <div className="text-[#38BDF8] font-semibold uppercase tracking-wider">
                    Hardware Context Registers
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[#8B98A5]">
                    <div>PC: <span className="text-[#E6EDF3]">0x0040{selectedProcess.pid.slice(1)}A0</span></div>
                    <div>SP: <span className="text-[#E6EDF3]">0x7FFF0040</span></div>
                    <div>ACC: <span className="text-[#4ADE80]">{selectedProcess.cpuTime} ms</span></div>
                    <div>FLAGS: <span className="text-[#F59E0B]">0x0001</span></div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-y-2 text-[11px]">
                  <span className="text-[#53616E]">ARRIVAL TIME</span>
                  <span className="text-right text-[#E6EDF3]">{selectedProcess.arrivalTime} ms</span>
                  <span className="text-[#53616E]">BURST TIME</span>
                  <span className="text-right text-[#E6EDF3]">{selectedProcess.burstTime} ms</span>
                  <span className="text-[#53616E]">PRIORITY</span>
                  <span className="text-right text-[#F59E0B]">{selectedProcess.priority}</span>
                  <span className="text-[#53616E]">MEMORY FOOTPRINT</span>
                  <span className="text-right text-[#38BDF8]">{selectedProcess.memory} MB</span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] text-[#8B98A5]">
                    <span>EXECUTION PROGRESS</span>
                    <span>
                      {Math.round((selectedProcess.cpuTime / Math.max(1, selectedProcess.burstTime)) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[#11161B] rounded-[1px] overflow-hidden">
                    <div
                      className="h-full bg-[#3ECF72] transition-all duration-300"
                      style={{
                        width: `${Math.min(100, (selectedProcess.cpuTime / Math.max(1, selectedProcess.burstTime)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-[#141B21] space-y-2">
                  <div className="text-[10px] text-[#53616E] uppercase tracking-wider">
                    Lifecycle Transitions
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleStateChange(selectedProcess.pid, "RUNNING")}
                      disabled={selectedProcess.state === "RUNNING"}
                      className="h-8 bg-[#12271B] hover:bg-[#183525] border border-[#265438] disabled:opacity-40 text-[#4ADE80] text-[10px] font-bold rounded-[2px] flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Play className="w-3 h-3" /> RUN
                    </button>
                    <button
                      onClick={() => handleStateChange(selectedProcess.pid, "READY")}
                      disabled={selectedProcess.state === "READY"}
                      className="h-8 bg-[#0F2430] hover:bg-[#143242] border border-[#1E4B63] disabled:opacity-40 text-[#38BDF8] text-[10px] font-bold rounded-[2px] flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3 h-3" /> READY
                    </button>
                    <button
                      onClick={() => handleStateChange(selectedProcess.pid, "WAITING")}
                      disabled={selectedProcess.state === "WAITING"}
                      className="h-8 bg-[#281E0E] hover:bg-[#35250E] border border-[#594019] disabled:opacity-40 text-[#F59E0B] text-[10px] font-bold rounded-[2px] flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Pause className="w-3 h-3" /> WAIT
                    </button>
                    <button
                      onClick={() => handleStateChange(selectedProcess.pid, "TERMINATED")}
                      disabled={selectedProcess.state === "TERMINATED"}
                      className="h-8 bg-[#2A1215] hover:bg-[#3A191D] border border-[#5B2329] disabled:opacity-40 text-[#F87171] text-[10px] font-bold rounded-[2px] flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <XCircle className="w-3 h-3" /> STOP
                    </button>
                  </div>
                  <button
                    onClick={() => setConfirmKillPid(selectedProcess.pid)}
                    className="h-8 w-full bg-[#080B0D] hover:bg-[#2A1215] border border-[#5B2329]/70 text-[#F87171] text-[10px] font-bold rounded-[2px] transition-colors cursor-pointer"
                  >
                    KILL &amp; PURGE PCB
                  </button>
                </div>
              </div>
            </Panel>
          )}

          {lastTraceEvent && (
            <DecisionInspector event={lastTraceEvent} stepNumber={1} totalSteps={1} />
          )}
        </div>
      </div>

      {/* Spawn Process Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-[#050708]/85 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0C1013] border border-[#2A3844] rounded-[2px] max-w-md w-full p-5 shadow-2xl flex flex-col gap-4 aegis-brackets font-mono">
            <div className="flex items-center justify-between border-b border-[#1C252C] pb-3">
              <h2 className="text-xs font-bold text-[#E6EDF3] uppercase tracking-wider flex items-center gap-2">
                <TerminalSquare className="w-4 h-4 text-[#4ADE80]" />
                <span>Spawn Simulated Process</span>
              </h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-[#53616E] hover:text-[#E6EDF3] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex flex-col gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-[#8B98A5] text-[10px]">PROCESS ID (PID)</label>
                <input
                  type="text"
                  value={newPid}
                  onChange={(e) => setNewPid(e.target.value)}
                  required
                  className="h-8 bg-[#080B0D] border border-[#1C252C] rounded-[2px] px-2.5 text-[#E6EDF3] focus:outline-none focus:border-[#3ECF72]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[#8B98A5] text-[10px]">PROCESS NAME</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  className="h-8 bg-[#080B0D] border border-[#1C252C] rounded-[2px] px-2.5 text-[#E6EDF3] focus:outline-none focus:border-[#3ECF72]"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[#8B98A5] text-[10px]">BURST (MS)</label>
                  <input
                    type="number"
                    min="1"
                    value={newBurst}
                    onChange={(e) => setNewBurst(Number(e.target.value))}
                    className="h-8 bg-[#080B0D] border border-[#1C252C] rounded-[2px] px-2 text-[#E6EDF3]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[#8B98A5] text-[10px]">PRIORITY</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={newPriority}
                    onChange={(e) => setNewPriority(Number(e.target.value))}
                    className="h-8 bg-[#080B0D] border border-[#1C252C] rounded-[2px] px-2 text-[#E6EDF3]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[#8B98A5] text-[10px]">MEM (MB)</label>
                  <input
                    type="number"
                    min="16"
                    value={newMemory}
                    onChange={(e) => setNewMemory(Number(e.target.value))}
                    className="h-8 bg-[#080B0D] border border-[#1C252C] rounded-[2px] px-2 text-[#E6EDF3]"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end mt-3 pt-3 border-t border-[#1C252C]">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="h-8 px-3 bg-[#11161B] border border-[#1C252C] text-[#8B98A5] text-xs rounded-[2px] cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="h-8 px-4 bg-[#12271B] border border-[#265438] text-[#4ADE80] font-bold text-xs rounded-[2px] cursor-pointer"
                >
                  SPAWN PCB
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmKillPid)}
        title={`Purge Process ${confirmKillPid}`}
        description={`Confirm permanent removal of Process Control Block ${confirmKillPid} from the simulated kernel registry.`}
        confirmLabel="KILL & PURGE"
        onConfirm={() => {
          if (confirmKillPid) deleteProcess(confirmKillPid);
          setConfirmKillPid(null);
        }}
        onCancel={() => setConfirmKillPid(null)}
      />

      <ConfirmDialog
        open={confirmReset}
        title="Reset Process Registry"
        description="Restore the default simulated process table? Custom spawned processes will be cleared."
        confirmLabel="RESET REGISTRY"
        destructive={false}
        onConfirm={() => {
          resetProcesses();
          setConfirmReset(false);
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
