import { NavLink } from "react-router-dom";
import {
  Activity,
  Cpu,
  Database,
  HardDrive,
  LayoutDashboard,
  MemoryStick,
  Layers,
  Server,
  TerminalSquare,
  FolderTree,
  GitCommitHorizontal,
  Swords,
  ScrollText,
  Sliders,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { AegisInsignia } from "./AegisInsignia";

export interface NavItem {
  label: string;
  shortCode: string;
  path: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  badge?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "SYSTEM OPERATIONS",
    items: [
      { label: "Dashboard", shortCode: "CMD", path: "/", icon: LayoutDashboard },
      { label: "Process Manager", shortCode: "PRC", path: "/os/processes", icon: Activity },
      { label: "CPU Scheduler", shortCode: "CPU", path: "/os/scheduler", icon: Cpu },
      { label: "Memory Manager", shortCode: "MEM", path: "/os/memory", icon: MemoryStick },
      { label: "Paging", shortCode: "MMU", path: "/os/paging", icon: Layers },
      { label: "Disk Scheduler", shortCode: "DSK", path: "/os/disk", icon: HardDrive },
      { label: "File Manager", shortCode: "VFS", path: "/os/files", icon: FolderTree },
    ],
  },
  {
    title: "DATABASE SYSTEMS",
    items: [
      { label: "DBMS Explorer", shortCode: "DBM", path: "/db/explorer", icon: Database },
      { label: "SQL Console", shortCode: "SQL", path: "/db/sql", icon: TerminalSquare },
      { label: "Transactions", shortCode: "TRX", path: "/db/transactions", icon: GitCommitHorizontal },
    ],
  },
  {
    title: "ANALYTICS",
    items: [
      { label: "Algorithm Battle Lab", shortCode: "LAB", path: "/analytics/battle-lab", icon: Swords, badge: "NEW" },
      { label: "Event Logs", shortCode: "LOG", path: "/logs", icon: ScrollText },
      { label: "System Monitor", shortCode: "MON", path: "/monitor", icon: Server },
    ],
  },
  {
    title: "CONTROL",
    items: [
      { label: "Command Console", shortCode: "SHL", path: "/terminal", icon: TerminalSquare },
      { label: "Settings", shortCode: "CFG", path: "/settings", icon: Sliders },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export default function Sidebar({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const { backendConnected, backendLatencyMs, dbConnected, dbInfo } = useStore();

  const renderContent = (isMobile = false) => {
    const isCollapsed = !isMobile && collapsed;
    return (
      <div className="flex flex-col h-full bg-[#080B0D] border-r border-[#1C252C] select-none">
        {/* Identity Header */}
        <div className={cn("h-14 border-b border-[#1C252C] flex items-center justify-between px-3 shrink-0", isCollapsed && "justify-center px-2")}>
          <div className="flex items-center gap-2.5 min-w-0">
            <AegisInsignia className="w-7 h-7" />
            {!isCollapsed && (
              <div className="min-w-0">
                <div className="font-display text-sm font-bold tracking-[0.18em] text-[#E6EDF3] uppercase truncate">
                  AEGISVAULT
                </div>
                <div className="font-mono text-[9px] text-[#3ECF72] tracking-[0.16em] uppercase truncate">
                  OPS-CORE // REV 3.0
                </div>
              </div>
            )}
          </div>

          {isMobile ? (
            <button
              onClick={onCloseMobile}
              className="p-1 text-[#8B98A5] hover:text-[#E6EDF3] cursor-pointer"
              aria-label="Close navigation"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onToggleCollapse}
              className="hidden md:flex items-center justify-center w-6 h-6 rounded-[2px] border border-[#1C252C] bg-[#0C1013] text-[#8B98A5] hover:text-[#E6EDF3] hover:border-[#2A3844] transition-colors cursor-pointer"
              title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              aria-label={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 custom-scrollbar space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              {!isCollapsed ? (
                <div className="px-2.5 mb-1.5 flex items-center justify-between">
                  <span className="font-mono text-[9px] font-semibold text-[#53616E] tracking-[0.18em] uppercase">
                    {group.title}
                  </span>
                  <span className="h-[1px] flex-1 ml-2 bg-[#141B21]" />
                </div>
              ) : (
                <div className="h-[1px] mx-2 mb-2 bg-[#1C252C]" />
              )}

              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === "/"}
                    onClick={isMobile ? onCloseMobile : undefined}
                    title={isCollapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-[2px] font-mono text-xs transition-all duration-150",
                        isCollapsed && "justify-center px-2",
                        isActive
                          ? "bg-[#12271B]/65 text-[#E6EDF3] border border-[#265438]/70"
                          : "text-[#8B98A5] border border-transparent hover:bg-[#11161B] hover:text-[#E6EDF3]"
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-[#3ECF72]" />
                        )}
                        <item.icon
                          className={cn(
                            "w-3.5 h-3.5 shrink-0 transition-colors",
                            isActive ? "text-[#3ECF72]" : "text-[#53616E] group-hover:text-[#38BDF8]"
                          )}
                          strokeWidth={1.75}
                        />
                        {!isCollapsed && (
                          <>
                            <span className="truncate flex-1 tracking-wide">{item.label}</span>
                            {item.badge ? (
                              <span className="text-[8px] px-1 py-0.2 rounded-[2px] bg-[#0F2430] border border-[#1E4B63] text-[#38BDF8] font-bold tracking-widest">
                                {item.badge}
                              </span>
                            ) : (
                              <span className={cn("text-[9px] tracking-widest opacity-0 group-hover:opacity-100 transition-opacity", isActive ? "opacity-100 text-[#3ECF72]" : "text-[#53616E]")}>
                                {item.shortCode}
                              </span>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Real Link Status Footer */}
        <div className={cn("p-3 border-t border-[#1C252C] bg-[#06080A] font-mono text-[10px] shrink-0", isCollapsed && "px-2 py-2.5 flex flex-col items-center")}>
          {isCollapsed ? (
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                backendConnected === null
                  ? "bg-[#53616E]"
                  : backendConnected
                  ? "bg-[#3ECF72] animate-pulse"
                  : "bg-[#EF4444]"
              )}
              title={backendConnected ? "Backend Connected" : "Backend Offline"}
            />
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      backendConnected === null
                        ? "bg-[#53616E]"
                        : backendConnected
                        ? "bg-[#3ECF72] animate-pulse"
                        : "bg-[#EF4444]"
                    )}
                  />
                  <span className={backendConnected ? "text-[#4ADE80]" : backendConnected === false ? "text-[#F87171]" : "text-[#8B98A5]"}>
                    {backendConnected === null ? "PROBING API..." : backendConnected ? "API LINK ACTIVE" : "API OFFLINE"}
                  </span>
                </div>
                {backendLatencyMs !== null && (
                  <span className="text-[#53616E]">{backendLatencyMs}ms</span>
                )}
              </div>
              <div className="flex items-center justify-between text-[9px] text-[#53616E]">
                <span>DB ENGINE</span>
                <span className={dbConnected ? "text-[#38BDF8]" : "text-[#53616E]"}>
                  {dbConnected && dbInfo ? `${dbInfo.dialect} · ${dbInfo.database_name}` : backendConnected === false ? "UNAVAILABLE" : "CHECKING"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className={cn("hidden md:block shrink-0 transition-all duration-200", collapsed ? "w-[64px]" : "w-64")}>
        {renderContent(false)}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-[#050708]/80" onClick={onCloseMobile} />
          <aside className="relative w-68 max-w-[85vw] h-full z-10">
            {renderContent(true)}
          </aside>
        </div>
      )}
    </>
  );
}
