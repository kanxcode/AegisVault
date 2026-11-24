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
  ErrorState,
} from "@/components/ui";
import { useStore } from "@/lib/store";
import { HardDrive, Play, Plus, Trash2, RotateCcw, BarChart3 } from "lucide-react";
import { api } from "@/lib/api";
import {
  ExecutionPlayer,
  ExecutionTimeline,
  DecisionInspector,
  AlgorithmComparison,
} from "@/components/trace";
import type { TraceEvent } from "@/types/trace";

export default function DiskScheduler() {
  const {
    diskRequests,
    fetchDiskRequests,
    addDiskRequest,
    addEvent,
    setActiveExecution,
    setExecutingSimulation,
    pushNotification,
  } = useStore();
  const [algorithm, setAlgorithm] = useState("SCAN");
  const [headPos, setHeadPos] = useState(50);
  const [diskSize, setDiskSize] = useState(200);
  const [direction, setDirection] = useState("RIGHT");
  const [isRunning, setIsRunning] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [showComparison, setShowComparison] = useState<boolean>(false);

  const [newTrack, setNewTrack] = useState<number>(64);
  const [newSector, setNewSector] = useState<number>(1);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    fetchDiskRequests();
    api.getDiskHistory(5).then((h) => Array.isArray(h) && setHistory(h)).catch(() => {});
  }, [fetchDiskRequests]);

  const handleSimulate = async () => {
    setIsRunning(true);
    setExecutingSimulation(true);
    setIsPlaying(false);
    setErrorMsg(null);
    try {
      const pendingRequests = diskRequests.filter((r) => r.status === "PENDING").map((r) => r.track);
      if (pendingRequests.length === 0) {
        setErrorMsg("No pending I/O requests found. Enqueue tracks to simulate.");
        setIsRunning(false);
        setExecutingSimulation(false);
        return;
      }

      const data = await api.simulateDisk({
        algorithm,
        head: Number(headPos),
        requests: pendingRequests,
        disk_size: Number(diskSize),
        direction,
      });

      setSimResult(data);
      const events: TraceEvent[] = data.trace_events || [];
      setTraceEvents(events);
      setCurrentStep(0);
      fetchDiskRequests();
      api.getDiskHistory(5).then((h) => Array.isArray(h) && setHistory(h)).catch(() => {});

      if (data.execution_id) {
        setActiveExecution({
          execution_id: data.execution_id,
          module: "disk_scheduler",
          algorithm,
          status: "COMPLETED",
          total_steps: events.length,
        });
      }

      pushNotification({
        title: "DISK SCHEDULER COMPLETE",
        message: `${algorithm}: ${data.total_head_movement} total cylinders traversed`,
        severity: "SUCCESS",
        module: "DISK",
        execution_id: data.execution_id,
      });

      addEvent({
        module: "DISK",
        event: "DISK_SCHEDULING_COMPLETED",
        severity: "INFO",
        description: `Simulated ${algorithm} with ${data.total_head_movement} total track movement.`,
      });
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to simulate disk scheduling");
    } finally {
      setIsRunning(false);
      setExecutingSimulation(false);
    }
  };

  const handleAddRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newTrack < 0 || newTrack >= diskSize) {
      setErrorMsg(`Track must be between 0 and ${diskSize - 1}`);
      return;
    }
    setErrorMsg(null);
    await addDiskRequest(newTrack, newSector);
    setShowAddForm(false);
    setNewTrack(Math.floor(Math.random() * diskSize));
  };

  const handleDeleteRequest = async (id: string) => {
    try {
      await api.deleteDiskRequest(id);
      fetchDiskRequests();
    } catch {
      // ignore
    }
  };

  const handleClearServiced = async () => {
    try {
      await api.clearServicedDiskRequests();
      fetchDiskRequests();
    } catch {
      // ignore
    }
  };

  const currentEvent = traceEvents[currentStep] || null;
  const currentSimTime = currentEvent ? currentEvent.simulation_time : 0;

  const activeHeadTrack =
    currentEvent?.state_after?.head !== undefined ? currentEvent.state_after.head : headPos;

  const activeTotalMovement =
    currentEvent?.state_after?.cumulative_movement !== undefined
      ? currentEvent.state_after.cumulative_movement
      : currentEvent?.state_after?.total_head_movement !== undefined
      ? currentEvent.state_after.total_head_movement
      : simResult?.total_head_movement ?? 0;

  const activeServicedTracks: number[] =
    currentEvent?.state_after?.serviced ??
    traceEvents
      .slice(0, currentStep + 1)
      .filter((e) => e.operation === "head_seek" || e.operation === "service_request")
      .map((e) => e.state_after?.head ?? Number(e.entity?.replace("TRACK_", "")));

  // Build trajectory points up to active step
  const fullPath: number[] = simResult?.movement_path || [headPos];
  const visiblePath =
    traceEvents.length > 0 ? fullPath.slice(0, Math.min(fullPath.length, currentStep + 1)) : fullPath;

  const svgWidth = 680;
  const svgHeight = 200;
  const padX = 28;
  const padY = 24;
  const maxTrack = Math.max(1, diskSize - 1);

  return (
    <div className="flex flex-col gap-4 max-w-[1440px] mx-auto pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1C252C] pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#281E0E] border border-[#594019] text-[#F59E0B] rounded-[2px]">
              DSK-05
            </span>
            <HardDrive className="w-4 h-4 text-[#F59E0B]" />
            <h1 className="font-display text-xl font-bold tracking-[0.08em] text-[#E6EDF3] uppercase">
              Disk Scheduler &amp; Seek Trajectory
            </h1>
          </div>
          <p className="font-mono text-[10px] text-[#8B98A5] tracking-widest uppercase">
            Platter Head Arm Kinematics • Cylinder Seek Computation • Sweep &amp; Turnaround Trace
          </p>
        </div>

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

      {errorMsg && <ErrorState message={errorMsg} />}

      {showComparison && (
        <AlgorithmComparison
          moduleType="disk"
          defaultPayload={{
            head: Number(headPos),
            requests: diskRequests.filter((r) => r.status === "PENDING").map((r) => r.track),
            disk_size: Number(diskSize),
            direction,
          }}
          onApplyAlgorithm={(algo) => {
            setAlgorithm(algo);
            setShowComparison(false);
          }}
        />
      )}

      {/* Parameters Bar */}
      <div className="bg-[#0C1013] border border-[#1C252C] rounded-[2px] p-3.5 flex items-end gap-3.5 flex-wrap font-mono">
        <div className="flex flex-col gap-1">
          <label className="text-[9px] text-[#8B98A5]">ALGORITHM</label>
          <select
            className="h-8 bg-[#080B0D] border border-[#1C252C] rounded-[2px] px-2.5 text-xs text-[#E6EDF3] cursor-pointer"
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value)}
          >
            <option value="FCFS">FCFS (FIRST COME FIRST SERVE)</option>
            <option value="SSTF">SSTF (SHORTEST SEEK TIME FIRST)</option>
            <option value="SCAN">SCAN (ELEVATOR)</option>
            <option value="C-SCAN">C-SCAN (CIRCULAR SCAN)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[9px] text-[#8B98A5]">INITIAL HEAD</label>
          <input
            type="number"
            min="0"
            max={diskSize - 1}
            value={headPos}
            onChange={(e) => setHeadPos(Number(e.target.value))}
            className="h-8 w-24 bg-[#080B0D] border border-[#1C252C] rounded-[2px] px-2.5 text-xs text-[#E6EDF3]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[9px] text-[#8B98A5]">MAX TRACKS</label>
          <input
            type="number"
            min="50"
            max="1000"
            value={diskSize}
            onChange={(e) => setDiskSize(Number(e.target.value))}
            className="h-8 w-24 bg-[#080B0D] border border-[#1C252C] rounded-[2px] px-2.5 text-xs text-[#E6EDF3]"
          />
        </div>

        {(algorithm === "SCAN" || algorithm === "C-SCAN") && (
          <div className="flex flex-col gap-1">
            <label className="text-[9px] text-[#8B98A5]">SWEEP DIRECTION</label>
            <select
              className="h-8 bg-[#080B0D] border border-[#1C252C] rounded-[2px] px-2.5 text-xs text-[#E6EDF3] cursor-pointer"
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            >
              <option value="RIGHT">RIGHT (INCREASING)</option>
              <option value="LEFT">LEFT (DECREASING)</option>
            </select>
          </div>
        )}

        <button
          onClick={handleSimulate}
          disabled={isRunning}
          className="h-8 px-4 ml-auto bg-[#12271B] hover:bg-[#183525] border border-[#265438] disabled:opacity-40 text-[#4ADE80] text-xs font-bold rounded-[2px] flex items-center gap-2 uppercase cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{isRunning ? "SEEKING..." : "SIMULATE HEAD"}</span>
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricDisplay label="ACTIVE HEAD TRACK" value={activeHeadTrack} unit={`/ ${diskSize - 1}`} accent="cyan" />
        <MetricDisplay label="CUMULATIVE MOVEMENT" value={activeTotalMovement} unit="cyl" accent="green" />
        <MetricDisplay
          label="AVG SEEK DISTANCE"
          value={simResult ? simResult.average_seek_distance.toFixed(1) : "0.0"}
          unit="cyl/req"
          accent="amber"
        />
        <MetricDisplay
          label="PENDING QUEUE"
          value={diskRequests.filter((r) => r.status === "PENDING").length}
          unit="reqs"
          accent="neutral"
        />
      </div>

      {/* SVG Disk-Head Trajectory Visualizer */}
      <Panel
        title="Disk-Head Cylinder Trajectory Plot"
        code="SEEK-SVG"
        brackets
        subtitle={`Cylinder axis 0 → ${diskSize - 1} • Active head @ track ${activeHeadTrack}`}
      >
        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-52 bg-[#080B0D] border border-[#1C252C] rounded-[2px]"
          >
            {/* Cylinder grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const x = padX + frac * (svgWidth - padX * 2);
              const trackVal = Math.round(frac * maxTrack);
              return (
                <g key={frac}>
                  <line x1={x} y1={padY} x2={x} y2={svgHeight - 16} stroke="#141B21" strokeDasharray="3 3" />
                  <text
                    x={x}
                    y={14}
                    textAnchor="middle"
                    fill="#53616E"
                    fontSize="9"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {trackVal}
                  </text>
                </g>
              );
            })}

            {/* Full faint planned path */}
            {simResult && fullPath.length > 1 && (
              <polyline
                fill="none"
                stroke="#1E2B35"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                points={fullPath
                  .map((track, idx) => {
                    const x = padX + (track / maxTrack) * (svgWidth - padX * 2);
                    const y = padY + (idx / Math.max(1, fullPath.length - 1)) * (svgHeight - padY - 22);
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />
            )}

            {/* Active traversed path up to current step */}
            {visiblePath.length > 1 && (
              <polyline
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2"
                points={visiblePath
                  .map((track, idx) => {
                    const x = padX + (track / maxTrack) * (svgWidth - padX * 2);
                    const y = padY + (idx / Math.max(1, fullPath.length - 1)) * (svgHeight - padY - 22);
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />
            )}

            {/* Nodes */}
            {visiblePath.map((track, idx) => {
              const x = padX + (track / maxTrack) * (svgWidth - padX * 2);
              const y = padY + (idx / Math.max(1, fullPath.length - 1)) * (svgHeight - padY - 22);
              const isHead = idx === visiblePath.length - 1;
              return (
                <g key={idx}>
                  <circle
                    cx={x}
                    cy={y}
                    r={isHead ? 5 : 3.2}
                    fill={isHead ? "#3ECF72" : "#38BDF8"}
                    stroke="#050708"
                    strokeWidth="1.5"
                  />
                  <text
                    x={x + 7}
                    y={y + 3}
                    fill={isHead ? "#4ADE80" : "#8B98A5"}
                    fontSize="9"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {track}
                  </text>
                </g>
              );
            })}
          </svg>
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
        moduleName="DISK SCHEDULER"
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

      {/* Request Queue & History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <Panel
            title="I/O Request Queue"
            code="IO-Q"
            actions={
              <div className="flex gap-1.5">
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="h-6 px-2 bg-[#11161B] hover:bg-[#171E24] border border-[#1C252C] text-[#4ADE80] font-mono text-[10px] rounded-[2px] flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> ADD I/O
                </button>
                <button
                  onClick={handleClearServiced}
                  className="h-6 px-2 bg-[#11161B] hover:bg-[#171E24] border border-[#1C252C] text-[#8B98A5] font-mono text-[10px] rounded-[2px] flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> CLEAR SERVICED
                </button>
              </div>
            }
            noPadding
          >
            {showAddForm && (
              <form
                onSubmit={handleAddRequest}
                className="p-3 bg-[#080B0D] border-b border-[#1C252C] flex items-center gap-3 font-mono text-xs"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-[#8B98A5]">TRACK:</span>
                  <input
                    type="number"
                    min="0"
                    max={diskSize - 1}
                    value={newTrack}
                    onChange={(e) => setNewTrack(Number(e.target.value))}
                    className="h-7 w-20 px-2 bg-[#0C1013] border border-[#1C252C] text-[#E6EDF3]"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-[#8B98A5]">SECTOR:</span>
                  <input
                    type="number"
                    min="1"
                    max="32"
                    value={newSector}
                    onChange={(e) => setNewSector(Number(e.target.value))}
                    className="h-7 w-16 px-2 bg-[#0C1013] border border-[#1C252C] text-[#E6EDF3]"
                  />
                </div>
                <button
                  type="submit"
                  className="h-7 px-3 bg-[#12271B] border border-[#265438] text-[#4ADE80] font-bold rounded-[2px] ml-auto cursor-pointer"
                >
                  ENQUEUE
                </button>
              </form>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>REQ ID</TableHead>
                  <TableHead className="text-right">TRACK</TableHead>
                  <TableHead className="text-right">SECTOR</TableHead>
                  <TableHead>STATUS</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {diskRequests.map((req) => {
                  const isServicedAtStep = activeServicedTracks.includes(req.track);
                  return (
                    <TableRow key={req.id} className={req.track === activeHeadTrack ? "bg-[#12271B]/50" : ""}>
                      <TableCell className="font-bold">{req.id}</TableCell>
                      <TableCell className="text-right text-[#38BDF8]">{req.track}</TableCell>
                      <TableCell className="text-right text-[#8B98A5]">{req.sector}</TableCell>
                      <TableCell>
                        <Badge variant={isServicedAtStep || req.status === "SERVICED" ? "green" : "amber"} dot>
                          {isServicedAtStep ? "SERVICED" : req.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <button
                          onClick={() => handleDeleteRequest(req.id)}
                          className="text-[#53616E] hover:text-[#F87171] p-1 cursor-pointer"
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

        <div className="lg:col-span-5">
          <Panel title="Disk Run History" code="HIST" noPadding>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>RUN</TableHead>
                  <TableHead>ALGO</TableHead>
                  <TableHead className="text-right">MOVEMENT</TableHead>
                  <TableHead className="text-right">AVG SEEK</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length > 0 ? (
                  history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-[#53616E]">#{h.id}</TableCell>
                      <TableCell className="font-bold">{h.algorithm}</TableCell>
                      <TableCell className="text-right text-[#4ADE80]">{h.total_head_movement} cyl</TableCell>
                      <TableCell className="text-right text-[#38BDF8]">{h.average_seek_distance?.toFixed(1)} cyl</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-[#53616E]">
                      No disk scheduling runs recorded yet.
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
