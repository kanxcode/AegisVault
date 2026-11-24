import { useState } from "react";
import {
  Panel,
  Badge,
  StatusIndicator,
  ConfirmDialog,
} from "@/components/ui";
import { Sliders, RefreshCw, RotateCcw, ShieldCheck, Activity } from "lucide-react";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";

export default function Settings() {
  const {
    settings,
    updateSettings,
    backendConnected,
    backendLatencyMs,
    dbConnected,
    dbInfo,
    lastCheckedAt,
    refreshSystemStatus,
    resetProcesses,
    clearEvents,
    fetchMemoryBlocks,
    pushNotification,
  } = useStore();

  const [probing, setProbing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"PROCESSES" | "MEMORY" | "EVENTS" | null>(null);

  const handleProbe = async () => {
    setProbing(true);
    await refreshSystemStatus();
    setProbing(false);
  };

  const executeResetAction = async () => {
    if (confirmAction === "PROCESSES") {
      await resetProcesses();
      pushNotification({
        title: "PROCESS REGISTRY RESET",
        message: "Restored default simulated process table.",
        severity: "INFO",
        module: "PROC",
      });
    } else if (confirmAction === "MEMORY") {
      await api.resetMemoryBlocks().catch(() => {});
      await fetchMemoryBlocks();
      pushNotification({
        title: "MEMORY PARTITIONS RESET",
        message: "Restored default physical memory map.",
        severity: "INFO",
        module: "MEM",
      });
    } else if (confirmAction === "EVENTS") {
      await clearEvents();
      pushNotification({
        title: "EVENT LOGS CLEARED",
        message: "Cleared system event journal.",
        severity: "WARNING",
        module: "SYS",
      });
    }
    setConfirmAction(null);
  };

  return (
    <div className="flex flex-col gap-4 max-w-[1100px] mx-auto pb-8 font-mono">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1C252C] pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#11161B] border border-[#25303A] text-[#8B98A5] rounded-[2px]">
              CFG-02
            </span>
            <Sliders className="w-4 h-4 text-[#3ECF72]" />
            <h1 className="font-display text-xl font-bold tracking-[0.08em] text-[#E6EDF3] uppercase">
              System Settings &amp; Diagnostics
            </h1>
          </div>
          <p className="text-[10px] text-[#8B98A5] tracking-widest uppercase">
            Interface Surface Controls • Telemetry Polling Rate • Backend Link Diagnostics
          </p>
        </div>

        <button
          onClick={handleProbe}
          disabled={probing}
          className="h-8 px-3 bg-[#12271B] hover:bg-[#183525] border border-[#265438] text-[#4ADE80] text-xs font-bold rounded-[2px] flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${probing ? "animate-spin" : ""}`} />
          <span>PROBE DIAGNOSTICS</span>
        </button>
      </div>

      {/* Live Diagnostics */}
      <Panel title="Operational Connectivity Diagnostics" code="DIAG" brackets>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-[#080B0D] border border-[#1C252C] rounded-[2px] space-y-2">
            <div className="text-[10px] text-[#53616E]">FASTAPI BACKEND</div>
            <StatusIndicator
              tone={backendConnected ? "online" : backendConnected === false ? "offline" : "idle"}
              label={backendConnected ? "CONNECTED" : backendConnected === false ? "OFFLINE" : "PROBING"}
              detail={backendLatencyMs !== null ? `${backendLatencyMs}ms` : undefined}
            />
            <div className="text-[10px] text-[#8B98A5]">Endpoint: http://localhost:8000/api</div>
          </div>

          <div className="p-3 bg-[#080B0D] border border-[#1C252C] rounded-[2px] space-y-2">
            <div className="text-[10px] text-[#53616E]">DATABASE ENGINE</div>
            <StatusIndicator
              tone={dbConnected ? "online" : dbConnected === false ? "offline" : "idle"}
              label={dbConnected ? dbInfo?.dialect || "CONNECTED" : "UNAVAILABLE"}
              detail={dbInfo?.database_name}
            />
            <div className="text-[10px] text-[#8B98A5]">
              {dbInfo ? `${dbInfo.total_tables} tables · ${dbInfo.total_records} records` : "No catalog metadata"}
            </div>
          </div>

          <div className="p-3 bg-[#080B0D] border border-[#1C252C] rounded-[2px] space-y-2">
            <div className="text-[10px] text-[#53616E]">LAST HEALTH CHECK</div>
            <div className="text-sm font-bold text-[#E6EDF3] flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>{lastCheckedAt || "Pending"}</span>
            </div>
            <div className="text-[10px] text-[#8B98A5]">
              Poll Interval: {settings.pollingIntervalMs > 0 ? `${settings.pollingIntervalMs / 1000}s` : "Manual"}
            </div>
          </div>
        </div>
      </Panel>

      {/* Interface & Motion Preferences */}
      <Panel title="Visual Atmosphere & Telemetry Polling" code="UI">
        <div className="space-y-4 text-xs">
          <div className="flex items-center justify-between py-2 border-b border-[#141B21]">
            <div>
              <div className="text-[#E6EDF3] font-bold">Scan-Line Telemetry Overlay</div>
              <div className="text-[10px] text-[#8B98A5]">Subtle horizontal CRT texture over workspace viewport.</div>
            </div>
            <button
              onClick={() => updateSettings({ scanlines: !settings.scanlines })}
              className={`h-7 px-3 rounded-[2px] border font-bold cursor-pointer ${
                settings.scanlines
                  ? "bg-[#12271B] border-[#265438] text-[#4ADE80]"
                  : "bg-[#080B0D] border-[#1C252C] text-[#53616E]"
              }`}
            >
              {settings.scanlines ? "ENABLED" : "DISABLED"}
            </button>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-[#141B21]">
            <div>
              <div className="text-[#E6EDF3] font-bold">Technical Coordinate Grid</div>
              <div className="text-[10px] text-[#8B98A5]">Fine engineered grid lines across command surfaces.</div>
            </div>
            <button
              onClick={() => updateSettings({ gridBackground: !settings.gridBackground })}
              className={`h-7 px-3 rounded-[2px] border font-bold cursor-pointer ${
                settings.gridBackground
                  ? "bg-[#12271B] border-[#265438] text-[#4ADE80]"
                  : "bg-[#080B0D] border-[#1C252C] text-[#53616E]"
              }`}
            >
              {settings.gridBackground ? "ENABLED" : "DISABLED"}
            </button>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-[#141B21]">
            <div>
              <div className="text-[#E6EDF3] font-bold">Motion Preference</div>
              <div className="text-[10px] text-[#8B98A5]">Respect OS reduced-motion setting or enforce reduced transitions.</div>
            </div>
            <select
              value={settings.reducedMotion}
              onChange={(e) => updateSettings({ reducedMotion: e.target.value as any })}
              className="h-8 bg-[#080B0D] border border-[#1C252C] rounded-[2px] px-2.5 text-[#E6EDF3]"
            >
              <option value="system">SYSTEM DEFAULT</option>
              <option value="reduce">REDUCE MOTION</option>
              <option value="allow">FULL MOTION</option>
            </select>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-[#E6EDF3] font-bold">Background Telemetry Poll Rate</div>
              <div className="text-[10px] text-[#8B98A5]">Frequency of /api/health and /api/system/metrics checks.</div>
            </div>
            <select
              value={settings.pollingIntervalMs}
              onChange={(e) => updateSettings({ pollingIntervalMs: Number(e.target.value) })}
              className="h-8 bg-[#080B0D] border border-[#1C252C] rounded-[2px] px-2.5 text-[#E6EDF3]"
            >
              <option value={2000}>2 SECONDS (HIGH)</option>
              <option value={5000}>5 SECONDS (DEFAULT)</option>
              <option value={10000}>10 SECONDS (LOW)</option>
              <option value={0}>MANUAL ONLY</option>
            </select>
          </div>
        </div>
      </Panel>

      {/* Simulation State Reset Controls */}
      <Panel title="Simulation State Management" code="RST">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <button
            onClick={() => setConfirmAction("PROCESSES")}
            className="p-3 bg-[#080B0D] hover:bg-[#11161B] border border-[#1C252C] rounded-[2px] text-left space-y-1 cursor-pointer"
          >
            <div className="flex items-center justify-between text-[#E6EDF3] font-bold">
              <span>Reset Process Registry</span>
              <RotateCcw className="w-3.5 h-3.5 text-[#38BDF8]" />
            </div>
            <div className="text-[10px] text-[#8B98A5]">Restore seeded P101–P107 PCB table.</div>
          </button>

          <button
            onClick={() => setConfirmAction("MEMORY")}
            className="p-3 bg-[#080B0D] hover:bg-[#11161B] border border-[#1C252C] rounded-[2px] text-left space-y-1 cursor-pointer"
          >
            <div className="flex items-center justify-between text-[#E6EDF3] font-bold">
              <span>Reset Memory Partitions</span>
              <RotateCcw className="w-3.5 h-3.5 text-[#4ADE80]" />
            </div>
            <div className="text-[10px] text-[#8B98A5]">Restore default RAM block map.</div>
          </button>

          <button
            onClick={() => setConfirmAction("EVENTS")}
            className="p-3 bg-[#080B0D] hover:bg-[#2A1215]/60 border border-[#5B2329]/70 rounded-[2px] text-left space-y-1 cursor-pointer"
          >
            <div className="flex items-center justify-between text-[#F87171] font-bold">
              <span>Purge Event Journal</span>
              <ShieldCheck className="w-3.5 h-3.5 text-[#F87171]" />
            </div>
            <div className="text-[10px] text-[#8B98A5]">Clear all recorded system_events rows.</div>
          </button>
        </div>

        <div className="mt-3 pt-3 border-t border-[#141B21] flex items-center justify-between text-[10px] text-[#53616E]">
          <span>AEGISVAULT PHASE 3 // ALL MODULES SANDBOXED</span>
          <Badge variant="cyan">NO HOST KERNEL MUTATION</Badge>
        </div>
      </Panel>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={`Confirm ${confirmAction} Reset`}
        description="This action will reset the selected simulated subsystem data in the backend database."
        confirmLabel="EXECUTE RESET"
        destructive={confirmAction === "EVENTS"}
        onConfirm={executeResetAction}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

