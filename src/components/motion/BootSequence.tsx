import { useEffect, useRef, useState } from "react";
import { createTimeline, stagger } from "animejs";
import { AegisInsignia } from "@/components/layout/AegisInsignia";
import { useStore } from "@/lib/store";
import { shouldReduceMotion } from "@/lib/motion";

interface BootSequenceProps {
  onComplete: () => void;
}

export function BootSequence({ onComplete }: BootSequenceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { backendConnected, dbConnected, dbInfo } = useStore();
  const [phaseLabel, setPhaseLabel] = useState("INITIALIZING OPERATIONS CORE...");

  useEffect(() => {
    if (shouldReduceMotion()) {
      onComplete();
      return;
    }

    const root = rootRef.current;
    if (!root) {
      onComplete();
      return;
    }

    const tl = createTimeline({
      defaults: { ease: "outExpo", duration: 320 },
      onComplete: () => {
        onComplete();
      },
    });

    tl.add(root.querySelectorAll(".boot-logo"), {
      opacity: [0, 1],
      scale: [0.92, 1],
      duration: 380,
    })
      .add(
        root.querySelectorAll(".boot-step"),
        {
          opacity: [0, 1],
          translateX: [-12, 0],
          delay: stagger(70),
          duration: 260,
          onBegin: () => setPhaseLabel("VERIFYING SUBSYSTEM TELEMETRY..."),
        },
        "-=140"
      )
      .add(
        root.querySelectorAll(".boot-bar-fill"),
        {
          width: ["0%", "100%"],
          duration: 460,
          ease: "inOutQuad",
          onBegin: () => setPhaseLabel("ESTABLISHING INTERFACE LINK..."),
        },
        "-=160"
      )
      .add(root, {
        opacity: [1, 0],
        duration: 280,
        ease: "inQuad",
      });

    return () => {
      tl.pause();
    };
  }, [onComplete]);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] bg-[#050708] aegis-grid-bg flex items-center justify-center p-6 select-none"
    >
      <div className="w-full max-w-md bg-[#0C1013] border border-[#2A3844] rounded-[2px] p-6 space-y-5 aegis-brackets shadow-2xl">
        <div className="boot-logo flex items-center gap-3.5 opacity-0">
          <AegisInsignia className="w-11 h-11" />
          <div>
            <div className="font-display text-lg font-bold tracking-[0.2em] text-[#E6EDF3] uppercase">
              AEGISVAULT
            </div>
            <div className="font-mono text-[10px] text-[#3ECF72] tracking-[0.16em] uppercase">
              SYSTEMS &amp; DATABASE OBSERVATORY // REV 3.0
            </div>
          </div>
        </div>

        <div className="space-y-2 font-mono text-[11px]">
          {[
            { code: "KERNEL_SIM", label: "OS Process, Memory, Paging & Disk Engines", status: "READY", color: "text-[#4ADE80]" },
            { code: "DBMS_OBS", label: "Dynamic Schema, View & Record Observatory", status: dbConnected ? (dbInfo?.dialect || "LINKED") : "STANDBY", color: "text-[#38BDF8]" },
            { code: "TRACE_ENG", label: "Deterministic Step Explainability Engine", status: "ACTIVE", color: "text-[#4ADE80]" },
            { code: "API_LINK", label: "FastAPI Telemetry Gateway", status: backendConnected ? "ONLINE" : "PROBING", color: backendConnected ? "text-[#4ADE80]" : "text-[#F59E0B]" },
          ].map((s) => (
            <div
              key={s.code}
              className="boot-step opacity-0 flex items-center justify-between px-2.5 py-1.5 bg-[#080B0D] border border-[#1C252C] rounded-[2px]"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[9px] text-[#53616E]">{s.code}</span>
                <span className="text-[#C5D1DC] truncate">{s.label}</span>
              </div>
              <span className={`text-[10px] font-bold shrink-0 ${s.color}`}>{s.status}</span>
            </div>
          ))}
        </div>

        <div className="space-y-1.5 font-mono">
          <div className="flex justify-between text-[10px] text-[#8B98A5]">
            <span>{phaseLabel}</span>
            <span className="text-[#3ECF72]">BOOT</span>
          </div>
          <div className="h-1 w-full bg-[#11161B] rounded-[1px] overflow-hidden">
            <div className="boot-bar-fill h-full bg-gradient-to-r from-[#3ECF72] to-[#38BDF8] w-0" />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={onComplete}
            className="font-mono text-[10px] text-[#53616E] hover:text-[#E6EDF3] tracking-wider uppercase cursor-pointer"
          >
            SKIP INITIALIZATION →
          </button>
        </div>
      </div>
    </div>
  );
}
