import { useState } from "react";
import {
  Panel,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ErrorState,
} from "@/components/ui";
import { Play, TerminalSquare, CheckCircle, Clock, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";
import { ExecutionPlayer, ExecutionTimeline, DecisionInspector } from "@/components/trace";
import type { TraceEvent } from "@/types/trace";

interface QueryHistoryEntry {
  id: string;
  sql: string;
  durationMs: number | null;
  rowCount: number;
  success: boolean;
  timestamp: string;
}

const SQL_KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "ORDER", "BY", "ASC", "DESC", "LIMIT", "OFFSET",
  "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "JOIN", "INNER",
  "LEFT", "RIGHT", "ON", "AND", "OR", "NOT", "AS", "GROUP", "HAVING", "COUNT",
  "SUM", "AVG", "MIN", "MAX", "DISTINCT", "IN", "LIKE", "IS", "NULL", "CREATE", "TABLE",
]);

function HighlightedSQL({ code }: { code: string }) {
  const tokens = code.split(/(\s+|[,();])/);
  return (
    <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words pointer-events-none">
      {tokens.map((tok, i) => {
        const upper = tok.toUpperCase();
        if (SQL_KEYWORDS.has(upper)) {
          return (
            <span key={i} className="text-[#38BDF8] font-bold">
              {tok}
            </span>
          );
        }
        if (/^['"].*['"]$/.test(tok)) {
          return (
            <span key={i} className="text-[#F59E0B]">
              {tok}
            </span>
          );
        }
        if (/^\d+(\.\d+)?$/.test(tok)) {
          return (
            <span key={i} className="text-[#4ADE80]">
              {tok}
            </span>
          );
        }
        return (
          <span key={i} className="text-[#E6EDF3]">
            {tok}
          </span>
        );
      })}
    </pre>
  );
}

export default function SQLConsole() {
  const [query, setQuery] = useState("SELECT id, username, role, last_login \nFROM users \nORDER BY id ASC;");
  const [results, setResults] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [queryHistory, setQueryHistory] = useState<QueryHistoryEntry[]>([]);

  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  const { addEvent, setActiveExecution, setExecutingSimulation } = useStore();

  const handleExecute = async () => {
    if (!query.trim()) return;
    setIsExecuting(true);
    setExecutingSimulation(true);
    setIsPlaying(false);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const res = await api.executeSql(query);
      if (res.success) {
        setColumns(res.columns || []);
        setResults(res.rows || []);
        setDurationMs(res.duration_ms);
        setStatusMessage(res.message || `Query executed in ${res.duration_ms} ms.`);
        const events: TraceEvent[] = res.trace_events || [];
        setTraceEvents(events);
        setCurrentStep(0);
        if (res.execution_id) {
          setActiveExecution({
            execution_id: res.execution_id,
            module: "sql_console",
            algorithm: "SQL_QUERY",
            status: "COMPLETED",
            total_steps: events.length,
          });
        }
      } else {
        setErrorMessage(res.error || "Query failed to execute.");
        setResults([]);
        setColumns([]);
        if (res.trace_events) {
          setTraceEvents(res.trace_events);
          setCurrentStep(0);
        }
      }

      setQueryHistory((prev) => [
        {
          id: `q_${Date.now()}`,
          sql: query.trim(),
          durationMs: res.duration_ms ?? null,
          rowCount: res.rows?.length ?? 0,
          success: Boolean(res.success),
          timestamp: new Date().toTimeString().slice(0, 8),
        },
        ...prev.slice(0, 14),
      ]);

      addEvent({
        module: "DB",
        event: "SQL_EXECUTE",
        severity: res.success ? "INFO" : "ERROR",
        description: `Executed query: ${query.substring(0, 48).replace(/\n/g, " ")}...`,
      });
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to contact database engine.");
    } finally {
      setIsExecuting(false);
      setExecutingSimulation(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleExecute();
    }
  };

  const currentEvent = traceEvents[currentStep] || null;

  const presets = [
    { label: "users", sql: "SELECT id, username, role, last_login FROM users ORDER BY id ASC;" },
    { label: "audit_logs", sql: "SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 10;" },
    { label: "sessions", sql: "SELECT * FROM sessions;" },
    { label: "system_config", sql: "SELECT * FROM system_config;" },
    { label: "processes", sql: "SELECT pid, name, state, priority, burst_time FROM processes;" },
  ];

  return (
    <div className="flex flex-col gap-4 max-w-[1440px] mx-auto pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1C252C] pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#0F2430] border border-[#1E4B63] text-[#38BDF8] rounded-[2px]">
              SQL-02
            </span>
            <TerminalSquare className="w-4 h-4 text-[#38BDF8]" />
            <h1 className="font-display text-xl font-bold tracking-[0.08em] text-[#E6EDF3] uppercase">
              SQL Console &amp; Query Execution Plan
            </h1>
          </div>
          <p className="font-mono text-[10px] text-[#8B98A5] tracking-widest uppercase">
            Parameterized SQL Engine • Syntax Highlighting • Logical Plan Trace &amp; Query History
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[10px] text-[#53616E] mr-1">PRESETS:</span>
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => setQuery(p.sql)}
              className="px-2.5 py-1 bg-[#0C1013] hover:bg-[#171E24] border border-[#1C252C] text-[#8B98A5] hover:text-[#38BDF8] font-mono text-[10px] rounded-[2px] cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Editor & Results */}
        <div className="lg:col-span-9 flex flex-col gap-4">
          <Panel
            title="SQL Query Terminal"
            code="AST"
            brackets
            actions={
              <span className="font-mono text-[10px] text-[#53616E]">CTRL+ENTER TO EXECUTE</span>
            }
            noPadding
          >
            <div className="grid grid-cols-1 md:grid-cols-2 border-b border-[#1C252C]">
              <div className="p-3.5 bg-[#080B0D] border-b md:border-b-0 md:border-r border-[#1C252C]">
                <div className="font-mono text-[9px] text-[#53616E] uppercase mb-1.5">INPUT BUFFER</div>
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={6}
                  className="w-full bg-transparent text-[#E6EDF3] font-mono text-xs resize-none focus:outline-none leading-relaxed"
                  spellCheck={false}
                  placeholder="Enter SQL query..."
                />
              </div>
              <div className="p-3.5 bg-[#050708]">
                <div className="font-mono text-[9px] text-[#38BDF8] uppercase mb-1.5">LEXICAL PREVIEW</div>
                <HighlightedSQL code={query} />
              </div>
            </div>

            <div className="px-3.5 py-2.5 bg-[#0C1013] flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-xs text-[#8B98A5]">
                <TerminalSquare className="w-3.5 h-3.5 text-[#3ECF72]" />
                <span>aegis_main @ sql_driver</span>
              </div>
              <button
                onClick={handleExecute}
                disabled={isExecuting}
                className="h-8 px-4 bg-[#12271B] hover:bg-[#183525] border border-[#265438] disabled:opacity-40 text-[#4ADE80] text-xs font-mono font-bold rounded-[2px] flex items-center gap-2 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isExecuting ? "EXECUTING..." : "EXECUTE QUERY"}</span>
              </button>
            </div>
          </Panel>

          {errorMessage && <ErrorState message={errorMessage} />}

          {statusMessage && !errorMessage && (
            <div className="px-3.5 py-2.5 bg-[#12271B]/60 border border-[#265438] text-[#4ADE80] font-mono text-xs rounded-[2px] flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5" />
                {statusMessage}
              </span>
              {durationMs !== null && (
                <span className="text-[#8B98A5] text-[10px] tabular-nums">Latency: {durationMs} ms</span>
              )}
            </div>
          )}

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
                moduleName="LOGICAL QUERY PLAN"
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

          <Panel
            title="Query Result Set"
            code="RES"
            noPadding
            actions={
              results.length > 0 && (
                <span className="font-mono text-[10px] text-[#4ADE80]">
                  {results.length} rows returned
                </span>
              )
            }
          >
            {results.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((key) => (
                      <TableHead key={key}>{key}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((row, i) => (
                    <TableRow key={i}>
                      {columns.map((col, j) => (
                        <TableCell key={j}>
                          {row[col] !== null && row[col] !== undefined ? (
                            String(row[col])
                          ) : (
                            <span className="text-[#53616E] italic">NULL</span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-14 text-center font-mono text-xs text-[#53616E]">
                NO RESULT ROWS // EXECUTE QUERY TO INSPECT OUTPUT
              </div>
            )}
          </Panel>
        </div>

        {/* Query History Sidebar */}
        <div className="lg:col-span-3">
          <Panel
            title="Query History"
            code="LOG"
            actions={
              queryHistory.length > 0 && (
                <button
                  onClick={() => setQueryHistory([])}
                  className="text-[#53616E] hover:text-[#F87171] cursor-pointer"
                  title="Clear History"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )
            }
            className="min-h-[420px]"
          >
            {queryHistory.length > 0 ? (
              <div className="space-y-2 max-h-[540px] overflow-y-auto custom-scrollbar">
                {queryHistory.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setQuery(item.sql)}
                    className="w-full text-left p-2.5 bg-[#080B0D] hover:bg-[#11161B] border border-[#1C252C] rounded-[2px] font-mono space-y-1 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-[9px]">
                      <Badge variant={item.success ? "green" : "red"}>
                        {item.success ? `${item.rowCount} ROWS` : "ERROR"}
                      </Badge>
                      <span className="text-[#53616E] flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" /> {item.timestamp}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#E6EDF3] line-clamp-2 break-all">{item.sql}</div>
                    {item.durationMs !== null && (
                      <div className="text-[9px] text-[#38BDF8]">{item.durationMs} ms</div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center font-mono text-[11px] text-[#53616E]">
                Executed SQL queries appear here for one-click reload.
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
