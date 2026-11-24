import { useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from "react";
import { Panel } from "@/components/ui/Panel";
import { TerminalSquare, FolderTree, Database, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { shouldReduceMotion } from "@/lib/motion";
import { AUTOCOMPLETE_ENTRIES, COMMAND_DEFINITIONS } from "@/lib/terminal/registry";
import { executeTerminalCommand, type TerminalOutputLine } from "@/lib/terminal/executor";
import { flattenVfsPaths, normalizeVirtualPath } from "@/lib/terminal/vfs";

type ExecStatus = "READY" | "EXECUTING" | "SUCCESS" | "ERROR" | "CANCELLED";

const MAX_HISTORY = 200;

function formatNowTimestamp(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function renderSyntaxHighlightedLine(line: TerminalOutputLine): ReactNode {
  const { text, type } = line;

  if (type === "prompt") {
    // Format: "aegis@aegis-ops-core:/path$ command args..."
    const promptMatch = text.match(/^(aegis@aegis-ops-core):([^\s$]+)\$\s*(.*)$/);
    if (promptMatch) {
      const [, userHost, pathPart, cmdPart] = promptMatch;
      const tokens = cmdPart.match(/"[^"]*"|'[^']*'|\S+|\s+/g) ?? [];
      let seenCmd = false;
      return (
        <>
          <span className="text-[#4ADE80] font-semibold">{userHost}</span>
          <span className="text-[#53616E]">:</span>
          <span className="text-[#38BDF8] font-semibold">{pathPart}</span>
          <span className="text-[#8B98A5]">$ </span>
          {tokens.map((tok, idx) => {
            if (/^\s+$/.test(tok)) return <span key={idx}>{tok}</span>;
            if (!seenCmd) {
              seenCmd = true;
              return (
                <span key={idx} className="text-[#E6EDF3] font-semibold">
                  {tok}
                </span>
              );
            }
            if (tok.startsWith('"') || tok.startsWith("'")) {
              return (
                <span key={idx} className="text-[#4ADE80]/90">
                  {tok}
                </span>
              );
            }
            if (tok.startsWith("-")) {
              return (
                <span key={idx} className="text-[#F59E0B]">
                  {tok}
                </span>
              );
            }
            return (
              <span key={idx} className="text-[#9EE7FF]">
                {tok}
              </span>
            );
          })}
        </>
      );
    }
  }

  // Highlight semantic bracketed prefixes like [SUCCESS], [ERROR], [SECURITY], [DATABASE], [DIR], [FILE]
  const tagMatch = text.match(/^(\s*)(\[[A-Z0-9_ -]+\])(.*)$/);
  if (tagMatch) {
    const [, indent, tag, rest] = tagMatch;
    let tagClass = "text-[#38BDF8] font-semibold";
    if (tag === "[SUCCESS]") tagClass = "text-[#4ADE80] font-semibold";
    else if (tag === "[ERROR]" || tag === "[SYNTAX ERROR]") tagClass = "text-[#F87171] font-semibold";
    else if (tag === "[WARNING]" || tag === "[CANCELLED]") tagClass = "text-[#F59E0B] font-semibold";
    else if (tag === "[SECURITY]") tagClass = "text-[#F87171] font-bold bg-[#2B1215]/70 px-1 rounded-[2px]";
    else if (tag === "[DIR]") tagClass = "text-[#38BDF8] font-semibold";
    else if (tag === "[FILE]") tagClass = "text-[#8B98A5]";

    return (
      <>
        {indent}
        <span className={tagClass}>{tag}</span>
        <span>{rest}</span>
      </>
    );
  }

  // Tree glyphs & dashed separator dimming
  if (/^[-\s]+$/.test(text) && text.includes("---")) {
    return <span className="text-[#354450]">{text}</span>;
  }

  return text || " ";
}

function getLineColorClass(type?: TerminalOutputLine["type"]): string {
  switch (type) {
    case "header":
      return "text-[#4ADE80] font-semibold tracking-wider";
    case "prompt":
      return "text-[#E6EDF3]";
    case "success":
      return "text-[#A7F3D0]";
    case "error":
      return "text-[#FCA5A5]";
    case "security":
      return "text-[#F87171]";
    case "warning":
      return "text-[#FCD34D]";
    case "info":
      return "text-[#7DD3FC]";
    default:
      return "text-[#C5D1DC]";
  }
}

export default function CommandTerminal() {
  const sessionStartRef = useRef<number>(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [cwd, setCwd] = useState<string>("/");
  const [lines, setLines] = useState<TerminalOutputLine[]>(() => [
    {
      text: "AEGISVAULT_COMMAND_CONSOLE // SANDBOXED APPLICATION INTERPRETER v4.0",
      type: "header",
      timestamp: formatNowTimestamp(),
    },
    {
      text: "[INFO] Explicit command registry active. Host shell execution is disabled.",
      type: "info",
      timestamp: formatNowTimestamp(),
    },
    {
      text: "Type 'help' for basic, virtual FS (pwd/ls/cd/cat), database (db.*), and subsystem (avx.*) commands.",
      type: "default",
      timestamp: formatNowTimestamp(),
    },
  ]);

  const [input, setInput] = useState("");
  const [draftBeforeHistory, setDraftBeforeHistory] = useState("");
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [execStatus, setExecStatus] = useState<ExecStatus>("READY");
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);

  // Live autocomplete pools from backend VFS & DBMS catalog
  const [knownVfsPaths, setKnownVfsPaths] = useState<string[]>([
    "/",
    "/etc",
    "/etc/aegis.conf",
    "/etc/db.conf",
    "/var",
    "/var/log",
    "/var/log/syslog",
    "/var/log/auth.log",
    "/root",
    "/bin",
  ]);
  const [knownDbObjects, setKnownDbObjects] = useState<string[]>([]);

  const reducedMotion = shouldReduceMotion();

  const refreshAutocompleteCatalog = useCallback(async () => {
    try {
      const [tree, tables, views] = await Promise.allSettled([
        api.getFileTree(),
        api.getTables("ALL", false, "TABLE"),
        api.getViews("ALL"),
      ]);
      if (tree.status === "fulfilled" && Array.isArray(tree.value)) {
        setKnownVfsPaths(flattenVfsPaths(tree.value));
      }
      const dbNames: string[] = [];
      if (tables.status === "fulfilled" && Array.isArray(tables.value)) {
        tables.value.forEach((t: any) => dbNames.push(t.name));
      }
      if (views.status === "fulfilled" && Array.isArray(views.value)) {
        views.value.forEach((v: any) => dbNames.push(v.name));
      }
      if (dbNames.length > 0) {
        setKnownDbObjects(Array.from(new Set(dbNames)).sort());
      }
    } catch {
      // Autocomplete silently retains last known paths/tables if backend offline
    }
  }, []);

  useEffect(() => {
    void refreshAutocompleteCatalog();
  }, [refreshAutocompleteCatalog]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
  }, [lines, reducedMotion]);

  const clearTerminal = useCallback(() => {
    setLines([]);
  }, []);

  // Compute contextual command & argument suggestions
  const suggestions = useMemo(() => {
    const raw = input;
    const trimmedLeft = raw.trimStart();
    if (!trimmedLeft) return [];

    const hasSpace = /\s/.test(trimmedLeft);
    if (!hasSpace) {
      const lower = trimmedLeft.toLowerCase();
      return AUTOCOMPLETE_ENTRIES.filter((c) => c.startsWith(lower)).slice(0, 6);
    }

    const parts = trimmedLeft.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const trailingSpace = /\s$/.test(raw);
    const currentArg = trailingSpace ? "" : parts[parts.length - 1];

    if (["cd", "ls", "tree", "cat", "mkdir", "touch"].includes(cmd) && !currentArg.startsWith("-")) {
      const prefix = currentArg
        ? normalizeVirtualPath(cwd, currentArg.endsWith("/") ? currentArg : currentArg)
        : cwd;
      return knownVfsPaths
        .filter((p) =>
          currentArg.startsWith("/")
            ? p.startsWith(currentArg)
            : p.startsWith(prefix === "/" ? `/${currentArg}` : `${cwd}/${currentArg}`.replace("//", "/")) ||
              p.toLowerCase().includes(currentArg.toLowerCase())
        )
        .slice(0, 6);
    }

    if (["db.describe", "db.select", "db.count", "db.keys"].includes(cmd) && !currentArg.startsWith("-")) {
      return knownDbObjects
        .filter((t) => t.toLowerCase().startsWith(currentArg.toLowerCase()))
        .slice(0, 6);
    }

    if (cmd === "help") {
      return COMMAND_DEFINITIONS.map((c) => c.name)
        .filter((n) => n.startsWith(currentArg.toLowerCase()))
        .slice(0, 6);
    }

    return [];
  }, [input, cwd, knownVfsPaths, knownDbObjects]);

  const applySuggestion = useCallback(
    (selected: string) => {
      const trimmedLeft = input.trimStart();
      if (!/\s/.test(trimmedLeft)) {
        setInput(selected.includes(" ") ? selected : `${selected} `);
      } else {
        const trailingSpace = /\s$/.test(input);
        const parts = trimmedLeft.split(/\s+/);
        if (trailingSpace) {
          setInput(`${input}${selected}`);
        } else {
          parts[parts.length - 1] = selected;
          setInput(`${parts.join(" ")} `);
        }
      }
      inputRef.current?.focus();
    },
    [input]
  );

  const runCommand = useCallback(
    async (rawCommand: string) => {
      const ts = formatNowTimestamp();
      const trimmed = rawCommand.trim();

      if (!trimmed) {
        setLines((prev) => [
          ...prev,
          { text: `aegis@aegis-ops-core:${cwd}$ `, type: "prompt", timestamp: ts },
        ]);
        return;
      }

      setCmdHistory((prev) => {
        const next = prev[prev.length - 1] === trimmed ? prev : [...prev, trimmed];
        return next.slice(-MAX_HISTORY);
      });

      setLines((prev) => [
        ...prev,
        { text: `aegis@aegis-ops-core:${cwd}$ ${trimmed}`, type: "prompt", timestamp: ts },
      ]);

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setExecStatus("EXECUTING");

      const res = await executeTerminalCommand(trimmed, {
        cwd,
        setCwd,
        history: cmdHistory,
        sessionStartedAtMs: sessionStartRef.current,
        clearTerminal,
        signal: controller.signal,
      });

      abortControllerRef.current = null;

      if (res.status === "CLEARED") {
        setExecStatus("READY");
        setLastDurationMs(res.durationMs);
        return;
      }

      const outTs = formatNowTimestamp();
      setLines((prev) => [
        ...prev,
        ...res.lines.map((l) => ({ ...l, timestamp: outTs })),
      ]);

      setExecStatus(res.status === "CANCELLED" ? "CANCELLED" : res.status === "ERROR" ? "ERROR" : "SUCCESS");
      setLastDurationMs(res.durationMs);

      // Refresh autocomplete catalog after VFS writes
      if (/^(mkdir|touch)\b/i.test(trimmed) && res.status === "SUCCESS") {
        void refreshAutocompleteCatalog();
      }
    },
    [cwd, cmdHistory, clearTerminal, refreshAutocompleteCatalog]
  );

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ctrl+L: Clear terminal buffer
    if (e.ctrlKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      clearTerminal();
      setExecStatus("READY");
      return;
    }

    // Ctrl+C: Abort active execution or clear current line (preserve clipboard copy if text selected)
    if (e.ctrlKey && e.key.toLowerCase() === "c") {
      const selectedText = window.getSelection()?.toString() ?? "";
      if (selectedText.length > 0) {
        return;
      }
      e.preventDefault();
      if (execStatus === "EXECUTING" && abortControllerRef.current) {
        abortControllerRef.current.abort();
        return;
      }
      if (input.length > 0) {
        setLines((prev) => [
          ...prev,
          { text: `aegis@aegis-ops-core:${cwd}$ ${input}^C`, type: "prompt", timestamp: formatNowTimestamp() },
        ]);
        setInput("");
        setHistoryIndex(-1);
        setExecStatus("CANCELLED");
      }
      return;
    }

    // ArrowUp / ArrowDown: History navigation
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (cmdHistory.length === 0) return;
      if (historyIndex === -1) {
        setDraftBeforeHistory(input);
      }
      const nextIdx = historyIndex === -1 ? cmdHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIdx);
      setInput(cmdHistory[nextIdx] ?? "");
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIdx = historyIndex + 1;
      if (nextIdx >= cmdHistory.length) {
        setHistoryIndex(-1);
        setInput(draftBeforeHistory);
      } else {
        setHistoryIndex(nextIdx);
        setInput(cmdHistory[nextIdx] ?? "");
      }
      return;
    }

    // Tab: Autocomplete command or contextual VFS/DB argument
    if (e.key === "Tab") {
      e.preventDefault();
      if (suggestions.length > 0) {
        applySuggestion(suggestions[0]);
      }
      return;
    }

    // Enter: Execute command
    if (e.key === "Enter") {
      e.preventDefault();
      if (execStatus === "EXECUTING") return;
      const toRun = input;
      setInput("");
      setDraftBeforeHistory("");
      setHistoryIndex(-1);
      await runCommand(toRun);
    }
  };

  const quickChips = [
    "help",
    "ls -la",
    "tree",
    "db.status",
    "db.tables",
    "db.views",
    "avx.status",
    "avx.trace.latest",
    "clear",
  ];

  const statusBadgeClass =
    execStatus === "EXECUTING"
      ? "bg-[#281E0E] border-[#594019] text-[#F59E0B]"
      : execStatus === "ERROR"
        ? "bg-[#2B1215] border-[#6E2329] text-[#F87171]"
        : execStatus === "CANCELLED"
          ? "bg-[#281E0E] border-[#594019] text-[#F59E0B]"
          : "bg-[#12271B] border-[#265438] text-[#4ADE80]";

  return (
    <div className="flex flex-col gap-4 max-w-[1440px] mx-auto pb-8 h-full font-mono">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1C252C] pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#12271B] border border-[#265438] text-[#4ADE80] rounded-[2px]">
              CTL-01
            </span>
            <TerminalSquare className="w-4 h-4 text-[#3ECF72]" />
            <h1 className="font-display text-xl font-bold tracking-[0.08em] text-[#E6EDF3] uppercase">
              AegisVault Command Console
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded-[2px] bg-[#0F2430] text-[#38BDF8] border border-[#1E4B63] flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" />
              APP SANDBOX INTERPRETER
            </span>
          </div>
          <p className="text-[10px] text-[#8B98A5] tracking-widest uppercase">
            Virtual Filesystem • Dynamic SQLAlchemy Introspection • Subsystem &amp; Trace Control
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-[#53616E]">QUICK:</span>
          {quickChips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => {
                setInput(chip);
                inputRef.current?.focus();
              }}
              className="px-2 py-1 bg-[#0C1013] hover:bg-[#171E24] border border-[#1C252C] text-[10px] text-[#8B98A5] hover:text-[#4ADE80] rounded-[2px] cursor-pointer transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Main Terminal Surface */}
      <Panel className="flex-1 min-h-[600px] flex flex-col bg-[#050708] border-[#1C252C]" brackets noPadding>
        {/* Terminal Status Chrome */}
        <div className="min-h-9 py-1.5 border-b border-[#1C252C] bg-[#080B0D] flex flex-wrap items-center justify-between gap-2 px-4">
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center text-[#8B98A5]">
              <TerminalSquare className="w-4 h-4 text-[#3ECF72] mr-2 shrink-0" />
              <span>aegis@aegis-ops-core</span>
            </div>
            <span className="text-[#354450]">|</span>
            <div className="flex items-center gap-1 text-[11px] text-[#38BDF8]">
              <FolderTree className="w-3.5 h-3.5" />
              <span>VFS PWD: {cwd}</span>
            </div>
            <span className="text-[#354450] hidden sm:inline">|</span>
            <div className="hidden sm:flex items-center gap-1 text-[10px] text-[#8B98A5]">
              <Database className="w-3 h-3 text-[#4ADE80]" />
              <span>{knownDbObjects.length} DB OBJECTS</span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[10px] text-[#53616E]">
            <span>TAB: COMPLETE</span>
            <span>CTRL+L: CLEAR</span>
            <span>CTRL+C: ABORT</span>
            <span>HIST ({cmdHistory.length})</span>
            {lastDurationMs !== null && <span className="text-[#8B98A5]">{lastDurationMs}ms</span>}
            <span className={`px-1.5 py-0.5 border rounded-[2px] font-semibold ${statusBadgeClass}`}>
              {execStatus}
            </span>
          </div>
        </div>

        {/* Scrollable Terminal Screen */}
        <div
          className="flex-1 overflow-auto p-4 text-xs custom-scrollbar flex flex-col space-y-1 cursor-text"
          onClick={() => {
            const sel = window.getSelection()?.toString() ?? "";
            if (!sel) inputRef.current?.focus();
          }}
        >
          {lines.map((line, i) => (
            <div
              key={i}
              className={`flex items-baseline gap-2.5 leading-relaxed ${getLineColorClass(line.type)}`}
            >
              <span className="text-[10px] text-[#3B4854] select-none shrink-0 tabular-nums">
                {line.timestamp || "--:--:--"}
              </span>
              <span className="whitespace-pre-wrap break-words flex-1">
                {renderSyntaxHighlightedLine(line)}
              </span>
            </div>
          ))}

          {/* Interactive Command Prompt */}
          <div className="flex items-center gap-2 pt-2 mt-1 border-t border-[#11181E]">
            <span className="text-[10px] text-[#3B4854] select-none shrink-0 tabular-nums">
              {execStatus === "EXECUTING" ? "RUNNING" : "PROMPT "}
            </span>
            <div className="flex items-center flex-1 min-w-0">
              <span className="text-[#4ADE80] font-semibold shrink-0">aegis@aegis-ops-core</span>
              <span className="text-[#53616E] shrink-0">:</span>
              <span className="text-[#38BDF8] font-semibold shrink-0">{cwd}</span>
              <span className="text-[#8B98A5] mr-2 shrink-0">$</span>

              <div className="relative flex-1 flex items-center min-w-0">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={execStatus === "EXECUTING"}
                  placeholder={execStatus === "EXECUTING" ? "Executing command... (Ctrl+C to cancel)" : "Type command or 'help'..."}
                  className="w-full bg-transparent border-none outline-none text-[#E6EDF3] placeholder:text-[#3B4854] font-mono text-xs caret-[#4ADE80] disabled:opacity-60"
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                />
                {!reducedMotion && execStatus !== "EXECUTING" && input.length === 0 && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none w-1.5 h-3.5 bg-[#4ADE80]/80 animate-pulse ml-0.5 shrink-0"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Live Command / Path Suggestions Strip */}
          {suggestions.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pl-16 pt-1">
              <span className="text-[10px] text-[#53616E]">SUGGESTIONS [TAB]:</span>
              {suggestions.map((s, idx) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => applySuggestion(s)}
                  className={`px-1.5 py-0.5 rounded-[2px] border text-[10px] cursor-pointer transition-colors ${
                    idx === 0
                      ? "bg-[#12271B] border-[#265438] text-[#4ADE80]"
                      : "bg-[#0C1013] border-[#1C252C] text-[#8B98A5] hover:text-[#E6EDF3]"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div ref={endRef} />
        </div>
      </Panel>
    </div>
  );
}
