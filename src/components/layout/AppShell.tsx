import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { BootSequence } from "@/components/motion/BootSequence";
import { useStore } from "@/lib/store";
import { useScrollProgress, shouldReduceMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

export default function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [booted, setBooted] = useState(() => {
    try {
      return sessionStorage.getItem("aegis_booted") === "1" || shouldReduceMotion();
    } catch {
      return true;
    }
  });

  const mainRef = useRef<HTMLElement>(null);
  const { progress } = useScrollProgress(mainRef);
  const location = useLocation();
  const { settings, refreshSystemStatus } = useStore();

  useEffect(() => {
    refreshSystemStatus();
    if (settings.pollingIntervalMs <= 0) return;
    const interval = setInterval(() => {
      refreshSystemStatus();
    }, settings.pollingIntervalMs);
    return () => clearInterval(interval);
  }, [refreshSystemStatus, settings.pollingIntervalMs]);

  const handleBootComplete = () => {
    try {
      sessionStorage.setItem("aegis_booted", "1");
    } catch {
      // ignore
    }
    setBooted(true);
  };

  return (
    <div
      className={cn(
        "flex h-screen w-full bg-[#050708] text-[#E6EDF3] overflow-hidden",
        settings.scanlines && "aegis-scanlines",
        settings.reducedMotion === "reduce" && "aegis-reduced-motion"
      )}
    >
      {!booted && <BootSequence onComplete={handleBootComplete} />}

      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0 relative">
        <TopBar onOpenMobileNav={() => setMobileNavOpen(true)} />

        {/* Subtle Scroll Progress Indicator */}
        <div className="h-[2px] w-full bg-[#080B0D] shrink-0 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#3ECF72] to-[#38BDF8] transition-[width] duration-75"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>

        <main
          ref={mainRef}
          className={cn(
            "flex-1 overflow-auto p-4 md:p-6 custom-scrollbar aegis-atmosphere",
            settings.gridBackground && "aegis-grid-bg"
          )}
        >
          <div key={location.pathname} className="aegis-enter h-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
