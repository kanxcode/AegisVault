import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { animate } from "animejs";
import { shouldReduceMotion } from "@/lib/motion";
import { Bell, Search, Menu, X, ArrowRight, CheckCheck, Trash2, Terminal } from "lucide-react";
import { useStore } from "@/lib/store";
import { StatusIndicator } from "@/components/ui/StatusIndicator";
import { NAV_GROUPS } from "./Sidebar";
import { cn } from "@/lib/utils";

const ROUTE_TITLES: Record<string, { group: string; label: string }> = {
  "/": { group: "SYSTEM OPERATIONS", label: "Command Centre" },
  "/os/processes": { group: "SYSTEM OPERATIONS", label: "Process Manager" },
  "/os/scheduler": { group: "SYSTEM OPERATIONS", label: "CPU Scheduler" },
  "/os/memory": { group: "SYSTEM OPERATIONS", label: "Memory Manager" },
  "/os/paging": { group: "SYSTEM OPERATIONS", label: "Paging & MMU" },
  "/os/disk": { group: "SYSTEM OPERATIONS", label: "Disk Scheduler" },
  "/os/files": { group: "SYSTEM OPERATIONS", label: "File Manager" },
  "/db/explorer": { group: "DATABASE SYSTEMS", label: "DBMS Explorer" },
  "/db/relationships": { group: "DATABASE SYSTEMS", label: "Schema Relationships" },
  "/db/sql": { group: "DATABASE SYSTEMS", label: "SQL Console" },
  "/db/transactions": { group: "DATABASE SYSTEMS", label: "Transactions" },
  "/analytics/battle-lab": { group: "ANALYTICS", label: "Algorithm Battle Lab" },
  "/logs": { group: "ANALYTICS", label: "Event Logs" },
  "/monitor": { group: "ANALYTICS", label: "System Monitor" },
  "/terminal": { group: "CONTROL", label: "Command Console" },
  "/settings": { group: "CONTROL", label: "Settings" },
};

export default function TopBar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    backendConnected,
    backendLatencyMs,
    dbConnected,
    dbInfo,
    activeExecution,
    isExecutingSimulation,
    getSystemState,
    notifications,
    events,
    markAllNotificationsRead,
    clearNotifications,
  } = useStore();

  const [clock, setClock] = useState(() => new Date().toTimeString().slice(0, 8));
  const [notifOpen, setNotifOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notifOpen || shouldReduceMotion() || !notifRef.current) return;
    const anim = animate(notifRef.current, {
      opacity: [0, 1],
      translateY: [-6, 0],
      duration: 180,
      ease: "outExpo",
    });
    return () => {
      anim.pause();
    };
  }, [notifOpen]);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toTimeString().slice(0, 8)), 1000);
    return () => clearInterval(t);
  }, []);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
        setNotifOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const currentRoute = ROUTE_TITLES[location.pathname] || { group: "AEGISVAULT", label: "Module" };
  const sysState = getSystemState();

  const stateTone =
    sysState === "NOMINAL"
      ? "online"
      : sysState === "EXECUTING"
      ? "executing"
      : sysState === "DEGRADED"
      ? "degraded"
      : sysState === "OFFLINE"
      ? "offline"
      : "idle";

  const unreadCount = notifications.filter((n) => !n.read).length;

  const allNavItems = useMemo(
    () =>
      NAV_GROUPS.flatMap((g) =>
        g.items.map((item) => ({ ...item, group: g.title }))
      ),
    []
  );

  const filteredNavItems = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    if (!q) return allNavItems;
    return allNavItems.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.group.toLowerCase().includes(q) ||
        i.shortCode.toLowerCase().includes(q) ||
        i.path.toLowerCase().includes(q)
    );
  }, [allNavItems, paletteQuery]);

  return (
    <>
      <header className="h-14 border-b border-[#1C252C] bg-[#080B0D]/95 backdrop-blur-sm flex items-center justify-between px-3 md:px-5 gap-3 shrink-0 z-30">
        {/* Left: Mobile Trigger + Active Module + Real Operational Telemetry */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onOpenMobileNav}
            className="md:hidden p-1.5 border border-[#1C252C] bg-[#0C1013] rounded-[2px] text-[#8B98A5] hover:text-[#E6EDF3] cursor-pointer"
            aria-label="Open navigation"
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Route Breadcrumb */}
          <div className="flex items-center gap-2 font-mono text-xs min-w-0">
            <span className="hidden lg:inline text-[10px] text-[#53616E] tracking-[0.14em] uppercase">
              {currentRoute.group}
            </span>
            <span className="hidden lg:inline text-[#2A3844]">/</span>
            <span className="text-[#E6EDF3] font-semibold tracking-wide truncate">
              {currentRoute.label}
            </span>
          </div>

          <div className="hidden xl:block h-4 w-[1px] bg-[#1C252C]" />

          {/* Real Operational Telemetry Strip */}
          <div className="hidden xl:flex items-center gap-2">
            <StatusIndicator
              tone={backendConnected === null ? "idle" : backendConnected ? "online" : "offline"}
              label={backendConnected === null ? "API: PROBING" : backendConnected ? "API: ONLINE" : "API: OFFLINE"}
              detail={backendLatencyMs !== null ? `${backendLatencyMs}ms` : undefined}
              pulse={backendConnected === true}
            />
            <StatusIndicator
              tone={dbConnected === null ? "idle" : dbConnected ? "online" : "offline"}
              label={dbConnected === null ? "DB: CHECKING" : dbConnected ? `DB: ${dbInfo?.dialect || "ONLINE"}` : "DB: OFFLINE"}
              detail={dbConnected && dbInfo ? dbInfo.database_name : undefined}
            />
            <StatusIndicator
              tone={stateTone}
              label={`SYS: ${sysState}`}
              pulse={isExecutingSimulation}
            />
            {activeExecution && (
              <button
                onClick={() => navigate(`/logs?exec=${encodeURIComponent(activeExecution.execution_id)}`)}
                title={`Inspect execution ${activeExecution.execution_id}`}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-[#1E4B63] bg-[#0F2430]/70 hover:bg-[#143242] rounded-[2px] font-mono text-[10px] text-[#38BDF8] cursor-pointer transition-colors"
              >
                <span className="text-[#8B98A5]">EXEC:</span>
                <span className="font-semibold">{activeExecution.execution_id.slice(-10)}</span>
                <span className="text-[#53616E]">({activeExecution.algorithm})</span>
              </button>
            )}
          </div>
        </div>

        {/* Right: Quick Search Palette, Notifications, Clock */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => setPaletteOpen(true)}
            className="h-8 px-2.5 bg-[#0C1013] hover:bg-[#11161B] border border-[#1C252C] hover:border-[#2A3844] rounded-[2px] flex items-center gap-2.5 text-xs font-mono text-[#8B98A5] hover:text-[#E6EDF3] transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 text-[#53616E]" />
            <span className="hidden sm:inline text-[11px]">Quick Jump...</span>
            <kbd className="hidden sm:inline text-[9px] text-[#53616E] border border-[#1C252C] px-1 py-0.2 rounded-[2px] bg-[#050708]">
              ⌘K
            </kbd>
          </button>

          {/* Notifications Dropdown Trigger */}
          <div className="relative">
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className="relative h-8 w-8 flex items-center justify-center border border-[#1C252C] bg-[#0C1013] hover:bg-[#11161B] rounded-[2px] text-[#8B98A5] hover:text-[#E6EDF3] transition-colors cursor-pointer"
              aria-label="System Notifications"
            >
              <Bell className="w-3.5 h-3.5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-[2px] bg-[#F59E0B] text-[#050708] font-mono text-[9px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div ref={notifRef} className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#0C1013] border border-[#2A3844] rounded-[2px] shadow-2xl z-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-[#1C252C] bg-[#080B0D] flex items-center justify-between">
                  <span className="font-mono text-[10px] font-semibold tracking-wider text-[#E6EDF3] uppercase">
                    OPERATIONAL NOTIFICATIONS ({notifications.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={markAllNotificationsRead}
                      className="text-[10px] font-mono text-[#38BDF8] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <CheckCheck className="w-3 h-3" /> Read
                    </button>
                    <button
                      onClick={clearNotifications}
                      className="text-[10px] font-mono text-[#8B98A5] hover:text-[#F87171] flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-72 overflow-y-auto custom-scrollbar divide-y divide-[#141B21]">
                  {notifications.length > 0 ? (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={cn(
                          "p-2.5 font-mono text-[11px] flex flex-col gap-0.5",
                          !n.read && "bg-[#11161B]"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={cn(
                              "font-bold text-[10px] uppercase",
                              n.severity === "ERROR"
                                ? "text-[#F87171]"
                                : n.severity === "WARNING"
                                ? "text-[#F59E0B]"
                                : n.severity === "SUCCESS"
                                ? "text-[#4ADE80]"
                                : "text-[#38BDF8]"
                            )}
                          >
                            {n.title}
                          </span>
                          <span className="text-[9px] text-[#53616E]">{n.timestamp}</span>
                        </div>
                        <p className="text-[11px] text-[#8B98A5]">{n.message}</p>
                      </div>
                    ))
                  ) : events.slice(0, 5).length > 0 ? (
                    events.slice(0, 5).map((ev) => (
                      <div key={ev.id} className="p-2.5 font-mono text-[11px] flex flex-col gap-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-[#38BDF8]">
                            [{ev.module}] {ev.event}
                          </span>
                          <span className="text-[9px] text-[#53616E]">{ev.timestamp}</span>
                        </div>
                        <p className="text-[10px] text-[#8B98A5] truncate">{ev.description}</p>
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center font-mono text-[11px] text-[#53616E]">
                      NO ACTIVE NOTIFICATIONS
                    </div>
                  )}
                </div>

                <div className="px-3 py-2 border-t border-[#1C252C] bg-[#080B0D] flex justify-between items-center">
                  <button
                    onClick={() => {
                      setNotifOpen(false);
                      navigate("/logs");
                    }}
                    className="font-mono text-[10px] text-[#4ADE80] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>OPEN EVENT LOGS</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setNotifOpen(false)}
                    className="font-mono text-[10px] text-[#53616E] hover:text-[#E6EDF3] cursor-pointer"
                  >
                    CLOSE
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="hidden sm:block h-4 w-[1px] bg-[#1C252C]" />

          <div className="hidden sm:flex items-center gap-2 font-mono text-xs text-[#8B98A5] tabular-nums">
            <span className="text-[9px] text-[#53616E] tracking-widest">LOCAL</span>
            <span className="text-[#E6EDF3]">{clock}</span>
          </div>
        </div>
      </header>

      {/* Global Command / Module Jump Palette */}
      {paletteOpen && (
        <div
          className="fixed inset-0 bg-[#050708]/85 z-50 flex items-start justify-center pt-20 p-4"
          onClick={() => setPaletteOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-[#0C1013] border border-[#2A3844] rounded-[2px] shadow-2xl overflow-hidden aegis-brackets"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-[#1C252C] bg-[#080B0D]">
              <Terminal className="w-4 h-4 text-[#3ECF72]" />
              <input
                autoFocus
                type="text"
                value={paletteQuery}
                onChange={(e) => setPaletteQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredNavItems.length > 0) {
                    navigate(filteredNavItems[0].path);
                    setPaletteOpen(false);
                    setPaletteQuery("");
                  }
                }}
                placeholder="Jump to module (e.g. Battle Lab, Scheduler, SQL, Settings)..."
                className="flex-1 bg-transparent font-mono text-xs text-[#E6EDF3] placeholder:text-[#53616E] focus:outline-none"
              />
              <button
                onClick={() => setPaletteOpen(false)}
                className="text-[#53616E] hover:text-[#E6EDF3] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto custom-scrollbar divide-y divide-[#141B21]">
              {filteredNavItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    setPaletteOpen(false);
                    setPaletteQuery("");
                  }}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-[#11161B] transition-colors cursor-pointer font-mono"
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="w-3.5 h-3.5 text-[#3ECF72]" />
                    <div>
                      <div className="text-xs text-[#E6EDF3] font-medium">{item.label}</div>
                      <div className="text-[9px] text-[#53616E] tracking-widest uppercase">
                        {item.group}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-[#38BDF8] border border-[#1C252C] px-1.5 py-0.5 rounded-[2px] bg-[#080B0D]">
                    {item.shortCode}
                  </span>
                </button>
              ))}
              {filteredNavItems.length === 0 && (
                <div className="py-8 text-center font-mono text-xs text-[#53616E]">
                  NO MATCHING MODULE DIRECTIVES
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
