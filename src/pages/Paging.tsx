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
import { Search, Play, ArrowRight, CheckCircle2, AlertCircle, Layers } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { ExecutionPlayer, ExecutionTimeline, DecisionInspector } from "@/components/trace";
import type { TraceEvent } from "@/types/trace";

export default function Paging() {
  const { setActiveExecution, setExecutingSimulation } = useStore();
  const [selectedPid, setSelectedPid] = useState("P101");
  const [searchTerm, setSearchTerm] = useState("");
  const [pagingData, setPagingData] = useState<any>(null);

  const [inputVirtualAddress, setInputVirtualAddress] = useState("0x1A4C");
  const [translationResult, setTranslationResult] = useState<any>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationTrace, setTranslationTrace] = useState<TraceEvent[]>([]);

  const [simAlgo, setSimAlgo] = useState("LRU");
  const [frameCount, setFrameCount] = useState(3);
  const [refStringInput, setRefStringInput] = useState("7, 0, 1, 2, 0, 3, 0, 4, 2, 3");
  const [pageSimResult, setPageSimResult] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const [simTraceEvents, setSimTraceEvents] = useState<TraceEvent[]>([]);
  const [currentSimStep, setCurrentSimStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  const loadProcessPaging = async (pid: string) => {
    try {
      const data = await api.getPagingInfo(pid);
      setPagingData(data);
    } catch {
      setPagingData({
        pid,
        page_table: [
          { page: 0, frame: 0, valid: true, modified: false },
          { page: 1, frame: 2, valid: true, modified: true },
          { page: 2, frame: 4, valid: true, modified: false },
          { page: 3, frame: null, valid: false, modified: false },
          { page: 4, frame: 6, valid: true, modified: true },
          { page: 5, frame: null, valid: false, modified: false },
          { page: 6, frame: 8, valid: true, modified: false },
        ],
        tlb: [
          { tag: "01", page: 0, frame: 0 },
          { tag: "02", page: 2, frame: 4 },
          { tag: "03", page: 4, frame: 6 },
        ],
        hit_rate: 94.2,
        miss_rate: 5.8,
      });
    }
  };

  useEffect(() => {
    loadProcessPaging(selectedPid);
  }, [selectedPid]);

  const handleTranslate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsTranslating(true);
    try {
      const res = await api.translateAddress({
        virtual_address: inputVirtualAddress,
        pid: selectedPid,
        page_size: 4096,
      });
      setTranslationResult(res);
      if (res.trace_events) setTranslationTrace(res.trace_events);
    } catch {
      const hex = inputVirtualAddress.replace(/^0x/i, "");
      const dec = parseInt(hex || "0", 16);
      const page = Math.floor(dec / 4096);
      const offset = dec % 4096;
      setTranslationResult({
        virtual_address: inputVirtualAddress,
        page_number: page,
        page_hex: `0x${page.toString(16).padStart(2, "0").toUpperCase()}`,
        offset,
        offset_hex: `0x${offset.toString(16).padStart(3, "0").toUpperCase()}`,
        tlb_hit: page === 0 || page === 2,
        page_fault: page > 6,
        frame_number: page * 2,
        frame_hex: `0x${(page * 2).toString(16).padStart(2, "0").toUpperCase()}`,
        physical_address: `0x${(page * 2 * 4096 + offset).toString(16).toUpperCase()}`,
        latency_ns: page === 0 || page === 2 ? 2 : 100,
      });
    } finally {
      setIsTranslating(false);
    }
  };

  const handleRunPagingSim = async () => {
    setIsSimulating(true);
    setExecutingSimulation(true);
    setIsPlaying(false);
    try {
      const refs = refStringInput
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => !isNaN(n));

      const res = await api.simulatePaging({
        algorithm: simAlgo,
        frame_count: Number(frameCount),
        reference_string: refs,
      });
      setPageSimResult(res);
      const events: TraceEvent[] = res.trace_events || [];
      setSimTraceEvents(events);
      setCurrentSimStep(0);
      if (res.execution_id) {
        setActiveExecution({
          execution_id: res.execution_id,
          module: "paging_replacement",
          algorithm: simAlgo,
          status: "COMPLETED",
          total_steps: events.length,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSimulating(false);
      setExecutingSimulation(false);
    }
  };

  const pageTable = pagingData?.page_table || [];
  const tlbEntries = pagingData?.tlb || [];

  const filteredPageTable = pageTable.filter((pt: any) => {
    const pageHex = `0x${pt.page.toString(16).padStart(2, "0")}`.toLowerCase();
    const frameHex = pt.frame !== null ? `0x${pt.frame.toString(16).padStart(2, "0")}`.toLowerCase() : "";
    return pageHex.includes(searchTerm.toLowerCase()) || frameHex.includes(searchTerm.toLowerCase());
  });

  const activeSimEvent = simTraceEvents[currentSimStep] || null;

  return (
    <div className="flex flex-col gap-4 max-w-[1440px] mx-auto pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1C252C] pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#0F2430] border border-[#1E4B63] text-[#38BDF8] rounded-[2px]">
              MMU-04
            </span>
            <Layers className="w-4 h-4 text-[#38BDF8]" />
            <h1 className="font-display text-xl font-bold tracking-[0.08em] text-[#E6EDF3] uppercase">
              Paging, MMU &amp; Virtual Memory
            </h1>
          </div>
          <p className="font-mono text-[10px] text-[#8B98A5] tracking-widest uppercase">
            Logical Address Decomposition • Page Table &amp; TLB Mapping • Page Fault Replacement
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#53616E]" />
            <input
              type="text"
              placeholder="Filter page/frame..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 w-52 bg-[#0C1013] border border-[#1C252C] rounded-[2px] pl-8 pr-2 text-xs text-[#E6EDF3] placeholder:text-[#53616E] focus:outline-none focus:border-[#38BDF8] font-mono"
            />
          </div>
          <select
            value={selectedPid}
            onChange={(e) => setSelectedPid(e.target.value)}
            className="h-8 bg-[#0C1013] border border-[#1C252C] rounded-[2px] px-2.5 text-xs text-[#E6EDF3] font-mono cursor-pointer"
          >
            <option value="P101">P101 (kernel_task)</option>
            <option value="P102">P102 (sys_monitor)</option>
            <option value="P103">P103 (db_worker_01)</option>
          </select>
        </div>
      </div>

      {/* TLB Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricDisplay label="ACTIVE PROCESS" value={selectedPid} accent="cyan" />
        <MetricDisplay label="TLB HIT RATE" value={pagingData?.hit_rate ?? 94.2} unit="%" accent="green" />
        <MetricDisplay label="TLB MISS RATE" value={pagingData?.miss_rate ?? 5.8} unit="%" accent="red" />
        <MetricDisplay label="PAGE SIZE" value="4096" unit="B (4 KB)" accent="neutral" />
      </div>

      {/* Page Table + TLB */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title={`Page Table (${selectedPid})`} code="PT" noPadding>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PAGE #</TableHead>
                <TableHead>FRAME #</TableHead>
                <TableHead>RESIDENT</TableHead>
                <TableHead>DIRTY BIT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPageTable.map((entry: any) => (
                <TableRow
                  key={entry.page}
                  className={
                    translationResult?.page_number === entry.page
                      ? "bg-[#12271B]/50 border-l-2 border-l-[#3ECF72]"
                      : ""
                  }
                >
                  <TableCell className="font-bold">
                    0x{entry.page.toString(16).padStart(2, "0").toUpperCase()}
                  </TableCell>
                  <TableCell className="text-[#38BDF8]">
                    {entry.frame !== null ? `0x${entry.frame.toString(16).padStart(2, "0").toUpperCase()}` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={entry.valid ? "green" : "red"} dot>
                      {entry.valid ? "VALID (1)" : "FAULT (0)"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[#8B98A5]">
                    {entry.modified ? "1 (MODIFIED)" : "0 (CLEAN)"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>

        <Panel title="Translation Lookaside Buffer (TLB)" code="TLB" noPadding>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>TAG</TableHead>
                <TableHead>VIRTUAL PAGE</TableHead>
                <TableHead>PHYSICAL FRAME</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tlbEntries.map((tlb: any) => (
                <TableRow
                  key={tlb.tag}
                  className={
                    translationResult?.tlb_hit && translationResult?.page_number === tlb.page
                      ? "bg-[#0F2430]/70 border-l-2 border-l-[#38BDF8]"
                      : ""
                  }
                >
                  <TableCell className="text-[#53616E]">{tlb.tag}</TableCell>
                  <TableCell className="font-bold">
                    0x{tlb.page.toString(16).padStart(2, "0").toUpperCase()}
                  </TableCell>
                  <TableCell className="text-[#4ADE80] font-bold">
                    0x{tlb.frame.toString(16).padStart(2, "0").toUpperCase()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>

      {/* MMU Translator & Page Replacement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Address Translation */}
        <Panel title="MMU Logical Address Translator" code="XLAT" brackets>
          <form onSubmit={handleTranslate} className="space-y-3 font-mono">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputVirtualAddress}
                onChange={(e) => setInputVirtualAddress(e.target.value)}
                placeholder="Virtual Hex (e.g. 0x1A4C)"
                className="flex-1 h-8 bg-[#080B0D] border border-[#1C252C] rounded-[2px] px-2.5 text-xs text-[#E6EDF3] focus:outline-none focus:border-[#38BDF8]"
              />
              <button
                type="submit"
                disabled={isTranslating}
                className="h-8 px-4 bg-[#0F2430] hover:bg-[#143242] border border-[#1E4B63] text-[#38BDF8] font-bold text-xs rounded-[2px] flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>TRANSLATE</span>
              </button>
            </div>

            {translationResult && (
              <div className="space-y-3">
                {/* Bitfield Decomposition Bar */}
                <div className="grid grid-cols-12 gap-1 bg-[#080B0D] p-2.5 border border-[#1C252C] rounded-[2px]">
                  <div className="col-span-4 bg-[#0F2430] border border-[#1E4B63] p-2 rounded-[2px] text-center">
                    <div className="text-[9px] text-[#8B98A5]">VIRTUAL PAGE</div>
                    <div className="text-xs font-bold text-[#38BDF8]">{translationResult.page_hex}</div>
                  </div>
                  <div className="col-span-4 bg-[#11161B] border border-[#2A3844] p-2 rounded-[2px] text-center">
                    <div className="text-[9px] text-[#8B98A5]">OFFSET (12-BIT)</div>
                    <div className="text-xs font-bold text-[#E6EDF3]">{translationResult.offset_hex}</div>
                  </div>
                  <div className="col-span-4 bg-[#12271B] border border-[#265438] p-2 rounded-[2px] text-center">
                    <div className="text-[9px] text-[#8B98A5]">FRAME + OFFSET</div>
                    <div className="text-xs font-bold text-[#4ADE80]">{translationResult.physical_address}</div>
                  </div>
                </div>

                <div className="p-2.5 bg-[#080B0D] border border-[#1C252C] rounded-[2px] text-[11px] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[#8B98A5]">
                      {translationResult.virtual_address} <ArrowRight className="w-3 h-3 inline mx-1" />{" "}
                      <strong className="text-[#4ADE80]">{translationResult.physical_address}</strong>
                    </span>
                    <span className="flex items-center gap-1.5">
                      {translationResult.tlb_hit ? (
                        <span className="text-[#4ADE80] flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> TLB HIT
                        </span>
                      ) : (
                        <span className="text-[#F59E0B] flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> TLB MISS
                        </span>
                      )}
                      <span className="text-[#53616E]">| {translationResult.latency_ns} ns</span>
                    </span>
                  </div>
                  <div className="text-[10px] text-[#8B98A5] pt-1 border-t border-[#141B21]">
                    Page = addr // 4096 = {translationResult.page_number} · Offset = addr % 4096 = {translationResult.offset} · Frame = {translationResult.frame_number}
                  </div>
                </div>
              </div>
            )}

            {translationTrace.length > 0 && (
              <DecisionInspector event={translationTrace[0]} stepNumber={1} totalSteps={1} />
            )}
          </form>
        </Panel>

        {/* Page Replacement Simulator */}
        <Panel title="Page Replacement Simulator" code="REP" brackets>
          <div className="space-y-3 font-mono text-xs">
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-[#8B98A5]">POLICY</label>
                <select
                  value={simAlgo}
                  onChange={(e) => setSimAlgo(e.target.value)}
                  className="h-8 bg-[#080B0D] border border-[#1C252C] rounded-[2px] px-2 text-[#E6EDF3]"
                >
                  <option value="LRU">LRU</option>
                  <option value="FIFO">FIFO</option>
                  <option value="OPTIMAL">OPTIMAL</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-[#8B98A5]">FRAMES</label>
                <input
                  type="number"
                  min="2"
                  max="8"
                  value={frameCount}
                  onChange={(e) => setFrameCount(Number(e.target.value))}
                  className="h-8 bg-[#080B0D] border border-[#1C252C] rounded-[2px] px-2 text-[#E6EDF3]"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleRunPagingSim}
                  disabled={isSimulating}
                  className="w-full h-8 bg-[#12271B] hover:bg-[#183525] border border-[#265438] text-[#4ADE80] font-bold rounded-[2px] flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>SIMULATE</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[9px] text-[#8B98A5]">REFERENCE STRING (COMMA-SEPARATED)</label>
              <input
                type="text"
                value={refStringInput}
                onChange={(e) => setRefStringInput(e.target.value)}
                className="h-8 bg-[#080B0D] border border-[#1C252C] rounded-[2px] px-2.5 text-[#E6EDF3]"
              />
            </div>

            {pageSimResult && (
              <div className="p-2.5 bg-[#080B0D] border border-[#1C252C] rounded-[2px] space-y-2">
                <div className="flex justify-between text-[11px] pb-1.5 border-b border-[#141B21]">
                  <span>FAULTS: <strong className="text-[#F87171]">{pageSimResult.page_faults}</strong></span>
                  <span>HITS: <strong className="text-[#4ADE80]">{pageSimResult.hits}</strong></span>
                  <span>FAULT RATE: <strong className="text-[#F59E0B]">{pageSimResult.fault_rate}%</strong></span>
                </div>

                <div className="flex gap-1.5 overflow-x-auto custom-scrollbar py-1">
                  {pageSimResult.steps.map((step: any, idx: number) => {
                    const isSelected = idx === currentSimStep;
                    return (
                      <button
                        key={idx}
                        onClick={() => setCurrentSimStep(idx)}
                        className={`flex flex-col items-center border p-1.5 rounded-[2px] shrink-0 min-w-[42px] transition-all cursor-pointer ${
                          isSelected
                            ? "border-[#3ECF72] bg-[#12271B]"
                            : "border-[#1C252C] bg-[#0C1013] hover:border-[#2A3844]"
                        }`}
                      >
                        <span className="text-[9px] text-[#38BDF8] font-bold">P{step.page}</span>
                        <div className="h-[1px] w-full bg-[#1C252C] my-1" />
                        <div className="flex flex-col gap-0.5">
                          {step.frames.map((f: any, fi: number) => (
                            <span key={fi} className="text-[10px] text-center text-[#E6EDF3]">
                              {f !== null ? f : "—"}
                            </span>
                          ))}
                        </div>
                        <div className="h-[1px] w-full bg-[#1C252C] my-1" />
                        <span className={`text-[8px] font-bold ${step.hit ? "text-[#4ADE80]" : "text-[#F87171]"}`}>
                          {step.hit ? "HIT" : "FAULT"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Panel>
      </div>

      {simTraceEvents.length > 0 && (
        <div className="space-y-3">
          <ExecutionPlayer
            traceEvents={simTraceEvents}
            currentStep={currentSimStep}
            onStepChange={setCurrentSimStep}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            speed={playbackSpeed}
            setSpeed={setPlaybackSpeed}
            moduleName={`PAGE REPLACEMENT (${simAlgo})`}
          />
          <ExecutionTimeline
            traceEvents={simTraceEvents}
            currentStep={currentSimStep}
            onSelectStep={setCurrentSimStep}
          />
          <DecisionInspector
            event={activeSimEvent}
            stepNumber={currentSimStep + 1}
            totalSteps={simTraceEvents.length}
          />
        </div>
      )}
    </div>
  );
}
