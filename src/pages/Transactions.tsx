import { useState, useEffect } from "react";
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
} from "@/components/ui";
import {
  Activity,
  Search,
  Plus,
  Check,
  RotateCcw,
  AlertTriangle,
  GitCommitHorizontal,
  ArrowRight,
  ShieldCheck,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { ExecutionPlayer, ExecutionTimeline, DecisionInspector } from "@/components/trace";
import type { TraceEvent } from "@/types/trace";

export default function Transactions() {
  const { setActiveExecution, setExecutingSimulation } = useStore();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [locks, setLocks] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [isBeginModalOpen, setIsBeginModalOpen] = useState(false);
  const [newTxQuery, setNewTxQuery] = useState("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = 1;");
  const [deadlockState, setDeadlockState] = useState<any>(null);
  const [isSimulatingDeadlock, setIsSimulatingDeadlock] = useState(false);

  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  const loadData = async () => {
    try {
      const [txs, l] = await Promise.all([
        api.getTransactions(statusFilter, searchTerm),
        api.getLocks(),
      ]);
      setTransactions(txs);
      setLocks(l);
    } catch {
      // retain
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, searchTerm]);

  const handleTraceResponse = (res: any, algoLabel: string) => {
    if (res?.trace_events?.length > 0) {
      setTraceEvents(res.trace_events);
      setCurrentStep(0);
    }
    if (res?.execution_id) {
      setActiveExecution({
        execution_id: res.execution_id,
        module: "transactions",
        algorithm: algoLabel,
        status: "COMPLETED",
        total_steps: res.trace_events?.length || 1,
      });
    }
  };

  const handleBeginTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTxQuery.trim()) return;
    try {
      const res = await api.beginTransaction(newTxQuery);
      handleTraceResponse(res, "TX_BEGIN");
      setIsBeginModalOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCommit = async (id: string) => {
    try {
      const res = await api.commitTransaction(id);
      handleTraceResponse(res, "TX_COMMIT");
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRollback = async (id: string) => {
    try {
      const res = await api.rollbackTransaction(id);
      handleTraceResponse(res, "TX_ROLLBACK");
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeadlockCheck = async (induceDeadlock = false) => {
    setIsSimulatingDeadlock(true);
    setExecutingSimulation(true);
    try {
      const res = await api.simulateDeadlock(induceDeadlock);
      setDeadlockState(res);
      handleTraceResponse(res, induceDeadlock ? "DEADLOCK_RESOLUTION" : "WFG_CHECK");
      if (induceDeadlock) loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSimulatingDeadlock(false);
      setExecutingSimulation(false);
    }
  };

  const currentEvent = traceEvents[currentStep] || null;
  const activeCount = transactions.filter((t) => t.status === "ACTIVE").length;
  const committedCount = transactions.filter((t) => t.status === "COMMITTED").length;
  const rolledBackCount = transactions.filter((t) => t.status === "ROLLED_BACK").length;

  return (
    <div className="flex flex-col gap-4 max-w-[1440px] mx-auto pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1C252C] pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#281E0E] border border-[#594019] text-[#F59E0B] rounded-[2px]">
              TRX-03
            </span>
            <GitCommitHorizontal className="w-4 h-4 text-[#F59E0B]" />
            <h1 className="font-display text-xl font-bold tracking-[0.08em] text-[#E6EDF3] uppercase">
              Transaction Controller &amp; ACID Engine
            </h1>
          </div>
          <p className="font-mono text-[10px] text-[#8B98A5] tracking-widest uppercase">
            Strict 2-Phase Locking (2PL) • Commit/Rollback Lifecycle • Wait-For Graph Deadlock Detection
          </p>
        </div>

        <button
          onClick={() => setIsBeginModalOpen(true)}
          className="h-8 px-3.5 bg-[#12271B] hover:bg-[#183525] border border-[#265438] text-[#4ADE80] text-xs font-mono font-bold rounded-[2px] flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>BEGIN TRANSACTION</span>
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricDisplay label="ACTIVE TXNS" value={activeCount} accent="amber" />
        <MetricDisplay label="COMMITTED" value={committedCount} accent="green" />
        <MetricDisplay label="ROLLED BACK" value={rolledBackCount} accent="red" />
        <MetricDisplay label="HELD LOCKS" value={locks.length} accent="cyan" />
      </div>

      {/* Transaction Lifecycle & ACID Guarantees */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <Panel title="Transaction Lifecycle State Pipeline" code="2PL" brackets>
            <div className="flex flex-wrap items-center justify-between gap-2 py-2 font-mono text-xs">
              {[
                { stage: "BEGIN", desc: "Assign TX ID & WAL entry", color: "border-[#1E4B63] bg-[#0F2430] text-[#38BDF8]" },
                { stage: "ACTIVE", desc: `${activeCount} acquiring 2PL locks`, color: "border-[#594019] bg-[#281E0E] text-[#F59E0B]" },
                { stage: "COMMIT", desc: `${committedCount} durable writes`, color: "border-[#265438] bg-[#12271B] text-[#4ADE80]" },
                { stage: "ROLLBACK", desc: `${rolledBackCount} undo log reverts`, color: "border-[#5B2329] bg-[#2A1215] text-[#F87171]" },
              ].map((s, idx) => (
                <div key={s.stage} className="flex items-center gap-2 flex-1 min-w-[120px]">
                  <div className={`w-full p-2.5 rounded-[2px] border ${s.color}`}>
                    <div className="font-bold">{s.stage}</div>
                    <div className="text-[10px] opacity-80 mt-0.5">{s.desc}</div>
                  </div>
                  {idx < 3 && <ArrowRight className="w-3.5 h-3.5 text-[#2A3844] hidden sm:block shrink-0" />}
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="lg:col-span-5">
          <Panel title="ACID Enforcement Guarantees" code="ACID">
            <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
              <div className="p-2 bg-[#080B0D] border border-[#1C252C] rounded-[2px]">
                <div className="text-[#4ADE80] font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> ATOMICITY
                </div>
                <div className="text-[#8B98A5] mt-0.5">All-or-nothing commit or undo rollback.</div>
              </div>
              <div className="p-2 bg-[#080B0D] border border-[#1C252C] rounded-[2px]">
                <div className="text-[#38BDF8] font-bold">CONSISTENCY</div>
                <div className="text-[#8B98A5] mt-0.5">FK &amp; schema invariants preserved.</div>
              </div>
              <div className="p-2 bg-[#080B0D] border border-[#1C252C] rounded-[2px]">
                <div className="text-[#F59E0B] font-bold">ISOLATION</div>
                <div className="text-[#8B98A5] mt-0.5">Strict 2PL shared/exclusive locks.</div>
              </div>
              <div className="p-2 bg-[#080B0D] border border-[#1C252C] rounded-[2px]">
                <div className="text-[#4ADE80] font-bold">DURABILITY</div>
                <div className="text-[#8B98A5] mt-0.5">Committed states persisted in DB.</div>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#53616E]" />
          <input
            type="text"
            placeholder="Search TX ID or SQL..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 w-64 bg-[#0C1013] border border-[#1C252C] rounded-[2px] pl-8 pr-2.5 text-xs text-[#E6EDF3] placeholder:text-[#53616E] font-mono"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-8 bg-[#0C1013] border border-[#1C252C] rounded-[2px] px-2.5 text-xs text-[#E6EDF3] font-mono cursor-pointer"
        >
          <option value="ALL">ALL STATUSES</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="COMMITTED">COMMITTED</option>
          <option value="ROLLED_BACK">ROLLED BACK</option>
        </select>
      </div>

      {traceEvents.length > 0 && (
        <div className="space-y-3">
          <ExecutionPlayer
            traceEvents={traceEvents}
            currentStep={currentStep}
            onStepChange={setCurrentStep}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            speed={playbackSpeed}
            setSpeed={setPlaybackSpeed}
            moduleName="TRANSACTION TRACE"
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
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8">
          <Panel title="Transaction Journal" code="WAL" noPadding className="min-h-[420px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>TX ID</TableHead>
                  <TableHead>STATUS</TableHead>
                  <TableHead>STATEMENT</TableHead>
                  <TableHead className="text-right">DURATION</TableHead>
                  <TableHead className="text-right">CONTROLS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-bold text-[#38BDF8]">{tx.id}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          tx.status === "COMMITTED"
                            ? "green"
                            : tx.status === "ACTIVE"
                            ? "amber"
                            : "red"
                        }
                        dot
                      >
                        {tx.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[#8B98A5] max-w-[260px] truncate" title={tx.query}>
                      {tx.query}
                    </TableCell>
                    <TableCell className="text-right">{tx.duration_ms} ms</TableCell>
                    <TableCell className="text-right">
                      {tx.status === "ACTIVE" ? (
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => handleCommit(tx.id)}
                            className="h-6 px-2 bg-[#12271B] hover:bg-[#183525] border border-[#265438] text-[#4ADE80] text-[10px] font-bold rounded-[2px] flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-2.5 h-2.5" /> COMMIT
                          </button>
                          <button
                            onClick={() => handleRollback(tx.id)}
                            className="h-6 px-2 bg-[#2A1215] hover:bg-[#3A191D] border border-[#5B2329] text-[#F87171] text-[10px] font-bold rounded-[2px] flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-2.5 h-2.5" /> ABORT
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-[#53616E]">FINALIZED</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-4">
          <Panel title="Wait-For Graph Deadlock Monitor" code="WFG" brackets>
            <div className="flex flex-col items-center gap-2.5 py-2 font-mono">
              {deadlockState?.deadlock_detected ? (
                <>
                  <AlertTriangle className="w-7 h-7 text-[#F87171] animate-pulse" />
                  <div className="text-xs text-[#F87171] font-bold">DEADLOCK CYCLE DETECTED</div>
                  <div className="text-[11px] text-[#E6EDF3] bg-[#2A1215] px-2.5 py-1 border border-[#5B2329] rounded-[2px]">
                    {deadlockState.cycle?.join(" → ") || "T1 → T2 → T1"}
                  </div>
                  <div className="text-[10px] text-[#8B98A5] text-center">{deadlockState.resolution_action}</div>
                </>
              ) : (
                <>
                  <Activity className="w-7 h-7 text-[#4ADE80]" />
                  <div className="text-xs text-[#4ADE80] font-bold">GRAPH ACYCLIC // NOMINAL</div>
                  <div className="text-[10px] text-[#53616E]">No circular lock wait detected.</div>
                </>
              )}

              <div className="w-full pt-3 border-t border-[#141B21] flex gap-2">
                <button
                  onClick={() => handleDeadlockCheck(false)}
                  disabled={isSimulatingDeadlock}
                  className="flex-1 h-8 bg-[#080B0D] hover:bg-[#11161B] border border-[#1C252C] text-[#E6EDF3] text-[10px] font-bold rounded-[2px] cursor-pointer"
                >
                  SCAN GRAPH
                </button>
                <button
                  onClick={() => handleDeadlockCheck(true)}
                  disabled={isSimulatingDeadlock}
                  className="flex-1 h-8 bg-[#2A1215] hover:bg-[#3A191D] border border-[#5B2329] text-[#F87171] text-[10px] font-bold rounded-[2px] cursor-pointer"
                >
                  INDUCE DEADLOCK
                </button>
              </div>
            </div>
          </Panel>

          <Panel title="Active Lock Table" code="LOCKS" noPadding>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>TX ID</TableHead>
                  <TableHead>RESOURCE</TableHead>
                  <TableHead>MODE</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locks.length > 0 ? (
                  locks.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-bold">{l.tx_id}</TableCell>
                      <TableCell className="text-[#8B98A5]">{l.resource}</TableCell>
                      <TableCell>
                        <Badge variant={l.lock_type === "EXCLUSIVE" ? "red" : "cyan"}>{l.lock_type}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-6 text-[#53616E]">
                      NO ACTIVE LOCKS HELD
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Panel>
        </div>
      </div>

      {/* Begin TX Modal */}
      {isBeginModalOpen && (
        <div className="fixed inset-0 bg-[#050708]/85 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0C1013] border border-[#2A3844] rounded-[2px] max-w-md w-full p-5 shadow-2xl flex flex-col gap-4 font-mono aegis-brackets">
            <div className="flex items-center justify-between border-b border-[#1C252C] pb-2">
              <h2 className="text-xs font-bold text-[#E6EDF3] uppercase tracking-wider">
                Begin Atomic Transaction
              </h2>
              <button onClick={() => setIsBeginModalOpen(false)} className="text-[#53616E] hover:text-[#E6EDF3] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleBeginTx} className="flex flex-col gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-[#8B98A5] text-[10px]">TRANSACTION SQL</label>
                <textarea
                  rows={3}
                  value={newTxQuery}
                  onChange={(e) => setNewTxQuery(e.target.value)}
                  className="bg-[#080B0D] border border-[#1C252C] rounded-[2px] p-2.5 text-[#E6EDF3]"
                />
              </div>
              <div className="flex gap-2 justify-end pt-3 border-t border-[#1C252C]">
                <button
                  type="button"
                  onClick={() => setIsBeginModalOpen(false)}
                  className="h-8 px-3 bg-[#11161B] border border-[#1C252C] text-[#8B98A5] rounded-[2px] cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="h-8 px-4 bg-[#12271B] border border-[#265438] text-[#4ADE80] font-bold rounded-[2px] cursor-pointer"
                >
                  START TX
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
