import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Panel,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ConfirmDialog,
} from "@/components/ui";
import { useStore } from "@/lib/store";
import { Download, Search, Trash2, Eye, ScrollText } from "lucide-react";
import { api } from "@/lib/api";
import { ExecutionPlayer, ExecutionTimeline, DecisionInspector } from "@/components/trace";
import type { ExecutionHistoryItem, TraceEvent } from "@/types/trace";

export default function EventLogs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { events, fetchEvents, clearEvents } = useStore();
  const [activeTab, setActiveTab] = useState<"EVENTS" | "EXECUTIONS">("EVENTS");
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [moduleFilter, setModuleFilter] = useState("ALL");
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const [executions, setExecutions] = useState<ExecutionHistoryItem[]>([]);
  const [selectedExecutionTrace, setSelectedExecutionTrace] = useState<TraceEvent[]>([]);
  const [selectedExecutionMeta, setSelectedExecutionMeta] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);

  const loadExecutionHistory = async () => {
    try {
      const data = await api.getExecutionHistory(moduleFilter, 50);
      setExecutions(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleInspectExecution = async (executionId: string) => {
    try {
      const data = await api.getExecution(executionId);
      setSelectedExecutionMeta(data);
      const trace: TraceEvent[] = data.trace_events || [];
      setSelectedExecutionTrace(trace);
      setCurrentStep(0);
      setIsPlaying(false);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const execParam = searchParams.get("exec");
    if (execParam) {
      setActiveTab("EXECUTIONS");
      handleInspectExecution(execParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (activeTab === "EVENTS") {
      fetchEvents({
        search: searchTerm,
        severity: severityFilter,
        module: moduleFilter,
      });
    } else {
      loadExecutionHistory();
    }
  }, [searchTerm, severityFilter, moduleFilter, activeTab, fetchEvents]);

  const handleExport = () => {
    window.open(api.exportEventsUrl("csv"), "_blank");
  };

  const currentEvent = selectedExecutionTrace[currentStep] || null;

  return (
    <div className="flex flex-col gap-4 max-w-[1440px] mx-auto pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1C252C] pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#0F2430] border border-[#1E4B63] text-[#38BDF8] rounded-[2px]">
              LOG-02
            </span>
            <ScrollText className="w-4 h-4 text-[#38BDF8]" />
            <h1 className="font-display text-xl font-bold tracking-[0.08em] text-[#E6EDF3] uppercase">
              Event Stream &amp; Execution Audit
            </h1>
          </div>
          <p className="font-mono text-[10px] text-[#8B98A5] tracking-widest uppercase">
            Chronological System Telemetry • Module &amp; Severity Filters • Execution ID Replay
          </p>
        </div>

        <button
          onClick={handleExport}
          className="h-8 px-3 bg-[#0C1013] hover:bg-[#171E24] border border-[#1C252C] text-[#E6EDF3] text-xs font-mono font-bold rounded-[2px] flex items-center gap-2 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-[#4ADE80]" />
          <span>EXPORT CSV</span>
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-[#080B0D] p-0.5 rounded-[2px] border border-[#1C252C]">
          <button
            onClick={() => setActiveTab("EVENTS")}
            className={`px-3 py-1 font-mono text-xs rounded-[2px] transition-colors cursor-pointer ${activeTab === "EVENTS"
              ? "bg-[#12271B] text-[#4ADE80] border border-[#265438] font-bold"
              : "text-[#8B98A5] hover:text-[#E6EDF3]"
              }`}
          >
            SYSTEM EVENTS ({events.length})
          </button>
          <button
            onClick={() => setActiveTab("EXECUTIONS")}
            className={`px-3 py-1 font-mono text-xs rounded-[2px] transition-colors cursor-pointer ${activeTab === "EXECUTIONS"
              ? "bg-[#0F2430] text-[#38BDF8] border border-[#1E4B63] font-bold"
              : "text-[#8B98A5] hover:text-[#E6EDF3]"
              }`}
          >
            EXECUTION HISTORIES ({executions.length})
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#53616E]" />
          <input
            type="text"
            placeholder="Search events or execution ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 w-64 bg-[#0C1013] border border-[#1C252C] rounded-[2px] pl-8 pr-2.5 text-xs text-[#E6EDF3] placeholder:text-[#53616E] font-mono"
          />
        </div>

        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="h-8 bg-[#0C1013] border border-[#1C252C] rounded-[2px] px-2.5 text-xs text-[#E6EDF3] font-mono cursor-pointer"
        >
          <option value="ALL">ALL MODULES</option>
          <option value="PROC">PROCESSES (PROC)</option>
          <option value="CPU">CPU SCHEDULER (CPU)</option>
          <option value="MEM">MEMORY (MEM)</option>
          <option value="DISK">DISK I/O (DISK)</option>
          <option value="DB">DATABASE (DB)</option>
          <option value="FS">FILESYSTEM (FS)</option>
          <option value="TX">TRANSACTIONS (TX)</option>
        </select>

        {activeTab === "EVENTS" && (
          <>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="h-8 bg-[#0C1013] border border-[#1C252C] rounded-[2px] px-2.5 text-xs text-[#E6EDF3] font-mono cursor-pointer"
            >
              <option value="ALL">ALL SEVERITIES</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="ERROR">ERROR</option>
            </select>

            <button
              onClick={() => setConfirmClearOpen(true)}
              className="h-8 px-3 bg-[#0C1013] hover:bg-[#2A1215] border border-[#1C252C] hover:border-[#5B2329] text-[#8B98A5] hover:text-[#F87171] text-xs font-mono rounded-[2px] flex items-center gap-1.5 ml-auto cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>CLEAR LOGS</span>
            </button>
          </>
        )}
      </div>

      {/* Replay Engine */}
      {selectedExecutionTrace.length > 0 && (
        <Panel
          title={`Replay Engine // ${selectedExecutionMeta?.execution_id}`}
          code="REPLAY"
          brackets
          actions={
            <div className="flex items-center gap-2">
              <Badge variant="green">{selectedExecutionMeta?.module}</Badge>
              <Badge variant="cyan">{selectedExecutionMeta?.algorithm}</Badge>
              <button
                onClick={() => {
                  setSelectedExecutionTrace([]);
                  setSelectedExecutionMeta(null);
                  setSearchParams({});
                }}
                className="font-mono text-[10px] text-[#8B98A5] hover:text-[#E6EDF3] cursor-pointer"
              >
                CLOSE
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <ExecutionPlayer
              traceEvents={selectedExecutionTrace}
              currentStep={currentStep}
              onStepChange={setCurrentStep}
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
              speed={speed}
              setSpeed={setSpeed}
              moduleName={`${selectedExecutionMeta?.module} (${selectedExecutionMeta?.algorithm})`}
            />
            <ExecutionTimeline
              traceEvents={selectedExecutionTrace}
              currentStep={currentStep}
              onSelectStep={setCurrentStep}
            />
            <DecisionInspector
              event={currentEvent}
              stepNumber={currentStep + 1}
              totalSteps={selectedExecutionTrace.length}
            />
          </div>
        </Panel>
      )}

      {activeTab === "EVENTS" && (
        <Panel title="Chronological Event Stream" code="EVT" noPadding className="min-h-[520px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">TIMESTAMP</TableHead>
                <TableHead className="w-24">MODULE</TableHead>
                <TableHead className="w-48">EVENT</TableHead>
                <TableHead>DESCRIPTION</TableHead>
                <TableHead className="w-36 text-right">EXECUTION</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="text-[#8B98A5]">{event.timestamp}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        event.severity === "ERROR"
                          ? "red"
                          : event.severity === "WARNING"
                            ? "amber"
                            : "cyan"
                      }
                    >
                      {event.module}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={
                      event.severity === "ERROR"
                        ? "text-[#F87171] font-bold"
                        : event.severity === "WARNING"
                          ? "text-[#F59E0B] font-bold"
                          : "text-[#E6EDF3] font-bold"
                    }
                  >
                    {event.event}
                  </TableCell>
                  <TableCell className="text-[#C5D1DC]">{event.description}</TableCell>
                  <TableCell className="text-right">
                    {event.execution_id ? (
                      <button
                        onClick={() => {
                          setActiveTab("EXECUTIONS");
                          handleInspectExecution(event.execution_id!);
                        }}
                        className="px-2 py-0.5 bg-[#0F2430] border border-[#1E4B63] text-[#38BDF8] text-[10px] rounded-[2px] cursor-pointer"
                      >
                        {event.execution_id.slice(-10)}
                      </button>
                    ) : (
                      <span className="text-[#53616E] text-[10px]">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-[#53616E]">
                    NO EVENT LOG RECORDS RECORDED
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Panel>
      )}

      {activeTab === "EXECUTIONS" && (
        <Panel title="Stored Execution Trace Registry" code="AUD" noPadding className="min-h-[520px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>EXECUTION ID</TableHead>
                <TableHead>MODULE</TableHead>
                <TableHead>ALGORITHM</TableHead>
                <TableHead>STATUS</TableHead>
                <TableHead className="text-right">STEPS</TableHead>
                <TableHead>RECORDED AT</TableHead>
                <TableHead className="text-right">ACTION</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {executions.map((item) => (
                <TableRow key={item.execution_id}>
                  <TableCell className="font-bold text-[#38BDF8]">{item.execution_id}</TableCell>
                  <TableCell className="text-[#8B98A5] uppercase">{item.module}</TableCell>
                  <TableCell className="text-[#4ADE80] font-semibold">{item.algorithm}</TableCell>
                  <TableCell>
                    <Badge variant={item.status === "COMPLETED" || item.status === "SUCCESS" ? "green" : "amber"}>
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{item.total_steps}</TableCell>
                  <TableCell className="text-[#8B98A5]">{item.created_at}</TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={() => handleInspectExecution(item.execution_id)}
                      className="px-2.5 py-1 bg-[#12271B] hover:bg-[#183525] border border-[#265438] text-[#4ADE80] text-[10px] rounded-[2px] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3 h-3" />
                      <span>REPLAY</span>
                    </button>
                  </TableCell>
                </TableRow>
              ))}
              {executions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-[#53616E]">
                    NO EXECUTIONS RECORDED YET
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Panel>
      )}

      <ConfirmDialog
        open={confirmClearOpen}
        title="Purge System Event Stream"
        description="Delete all recorded events from the database system_events journal?"
        confirmLabel="PURGE LOGS"
        onConfirm={async () => {
          await clearEvents();
          setConfirmClearOpen(false);
        }}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  );
}
