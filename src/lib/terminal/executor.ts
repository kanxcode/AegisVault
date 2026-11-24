import { api } from "@/lib/api";
import { formatBytes, formatGridTable, formatUptime } from "./format";
import { isValidDbIdentifier, parseCommandInput, type ParsedCommand } from "./parser";
import { COMMAND_DEFINITIONS, findCommandDefinition, REGISTERED_COMMANDS } from "./registry";
import {
  findVfsNode,
  normalizeVirtualPath,
  renderAsciiTree,
  splitParentAndName,
  type VfsNode,
} from "./vfs";

export interface TerminalOutputLine {
  text: string;
  type?: "default" | "prompt" | "success" | "error" | "warning" | "info" | "header" | "security";
  timestamp?: string;
}

export interface ExecutionContext {
  cwd: string;
  setCwd: (nextCwd: string) => void;
  history: string[];
  sessionStartedAtMs: number;
  clearTerminal: () => void;
  signal?: AbortSignal;
}

export interface ExecutionResult {
  status: "SUCCESS" | "ERROR" | "CANCELLED" | "CLEARED";
  lines: Array<{ text: string; type?: TerminalOutputLine["type"] }>;
  durationMs: number;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Command aborted by operator", "AbortError");
  }
}

function validateArgs(
  parsed: ParsedCommand,
  opts: {
    allowedFlags?: string[];
    allowedOptions?: string[];
    minPositional?: number;
    maxPositional?: number;
    usage: string;
  }
): string | null {
  const allowedFlags = new Set(opts.allowedFlags ?? []);
  const allowedOptions = new Set(opts.allowedOptions ?? []);

  for (const flag of parsed.flags) {
    if (!allowedFlags.has(flag)) {
      return `[ERROR] Unsupported flag '-${flag}'. Usage: ${opts.usage}`;
    }
  }
  for (const opt of Object.keys(parsed.options)) {
    if (!allowedOptions.has(opt)) {
      return `[ERROR] Unsupported option '--${opt}'. Usage: ${opts.usage}`;
    }
  }
  const minP = opts.minPositional ?? 0;
  const maxP = opts.maxPositional ?? Infinity;
  if (parsed.positional.length < minP) {
    return `[ERROR] Missing required argument. Usage: ${opts.usage}`;
  }
  if (parsed.positional.length > maxP) {
    return `[ERROR] Too many arguments (${parsed.positional.length}). Usage: ${opts.usage}`;
  }
  return null;
}

function splitSchemaTable(target: string): { schemaName?: string; tableName: string } {
  if (target.includes(".")) {
    const [sch, tbl] = target.split(".", 2);
    return { schemaName: sch, tableName: tbl };
  }
  return { tableName: target };
}

function parsePositiveIntOption(val: string | undefined, fallback: number, max: number): number {
  if (val === undefined) return fallback;
  const n = Number.parseInt(val, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid numeric value '${val}': expected positive integer (1-${max}).`);
  }
  return Math.min(n, max);
}

export async function executeTerminalCommand(
  rawInput: string,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const t0 = performance.now();
  const out: Array<{ text: string; type?: TerminalOutputLine["type"] }> = [];
  const push = (text: string, type: TerminalOutputLine["type"] = "default") => {
    out.push({ text, type });
  };

  const parsedRes = parseCommandInput(rawInput);
  if (!parsedRes.ok) {
    if (parsedRes.kind === "EMPTY") {
      return { status: "SUCCESS", lines: [], durationMs: 0 };
    }
    return {
      status: "ERROR",
      lines: [{ text: parsedRes.error, type: parsedRes.kind === "SECURITY" ? "security" : "error" }],
      durationMs: Math.round(performance.now() - t0),
    };
  }

  const parsed = parsedRes.parsed;
  const { command } = parsed;

  if (!REGISTERED_COMMANDS.has(command)) {
    return {
      status: "ERROR",
      lines: [
        {
          text: `[ERROR] Command '${command}' is not registered. Only explicitly allowed AegisVault commands may execute. Type 'help' to list valid commands.`,
          type: "error",
        },
      ],
      durationMs: Math.round(performance.now() - t0),
    };
  }

  try {
    throwIfAborted(ctx.signal);

    switch (command) {
      // =====================================================================
      // 1. BASIC & SESSION COMMANDS
      // =====================================================================
      case "clear": {
        ctx.clearTerminal();
        return { status: "CLEARED", lines: [], durationMs: Math.round(performance.now() - t0) };
      }

      case "help": {
        const argErr = validateArgs(parsed, { maxPositional: 1, usage: "help [command]" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };

        if (parsed.positional.length === 1) {
          const targetCmd = parsed.positional[0].toLowerCase();
          const def = findCommandDefinition(targetCmd);
          if (!def) {
            return {
              status: "ERROR",
              lines: [{ text: `[ERROR] No manual entry for '${targetCmd}'. Type 'help' for all commands.`, type: "error" }],
              durationMs: 0,
            };
          }
          push(`COMMAND MANUAL :: ${def.name}`, "header");
          push(`  Category:    ${def.category}`, "info");
          push(`  Usage:       ${def.usage}`, "default");
          push(`  Description: ${def.description}`, "default");
          break;
        }

        const groups: Array<{ title: string; cat: "BASIC" | "FILESYSTEM" | "DATABASE" | "AEGISVAULT" }> = [
          { title: "BASIC SYSTEM & TELEMETRY", cat: "BASIC" },
          { title: "VIRTUAL FILESYSTEM (SANDBOXED TO VFS)", cat: "FILESYSTEM" },
          { title: "DATABASE OBSERVATORY (DYNAMIC SQLALCHEMY)", cat: "DATABASE" },
          { title: "AEGISVAULT SUBSYSTEMS (AVX)", cat: "AEGISVAULT" },
        ];

        push("AEGISVAULT COMMAND INTERPRETER // REGISTERED COMMANDS", "header");
        for (const g of groups) {
          push("", "default");
          push(`[${g.title}]`, "info");
          for (const def of COMMAND_DEFINITIONS.filter((c) => c.category === g.cat)) {
            push(`  ${def.usage.padEnd(36)} ${def.description}`, "default");
          }
        }
        push("", "default");
        push("Shortcuts: [Tab] Autocomplete  [Up/Down] History  [Ctrl+L] Clear  [Ctrl+C] Cancel", "info");
        break;
      }

      case "whoami": {
        const argErr = validateArgs(parsed, { maxPositional: 0, usage: "whoami" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        push("aegis-operator (uid=1000 gid=1000 role=OPS_COMMANDER mode=SANDBOXED_CONSOLE)", "success");
        break;
      }

      case "hostname": {
        const argErr = validateArgs(parsed, { maxPositional: 0, usage: "hostname" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        push("aegis-ops-core.internal", "default");
        break;
      }

      case "date": {
        const argErr = validateArgs(parsed, { maxPositional: 0, usage: "date" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const now = new Date();
        push(`Local: ${now.toString()}`, "default");
        push(`UTC:   ${now.toUTCString()} (${now.toISOString()})`, "info");
        break;
      }

      case "uptime": {
        const argErr = validateArgs(parsed, { maxPositional: 0, usage: "uptime" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const sessionSec = Math.round((Date.now() - ctx.sessionStartedAtMs) / 1000);
        try {
          const metrics = await api.getSystemMetrics();
          throwIfAborted(ctx.signal);
          const backendUptime = typeof metrics.uptime_seconds === "number"
            ? formatUptime(metrics.uptime_seconds)
            : "Unavailable (backend did not report uptime)";
          push(`Backend Service Uptime : ${backendUptime}`, "success");
          push(`Console Session Uptime : ${formatUptime(sessionSec)}`, "info");
          push(
            `Load Telemetry         : CPU ${metrics.cpu_utilization}% | MEM ${metrics.memory_utilization}% | Active Procs ${metrics.active_processes} | Disk Queue ${metrics.disk_queue}`,
            "default"
          );
        } catch (err: any) {
          if (err?.name === "AbortError") throw err;
          push(`Console Session Uptime : ${formatUptime(sessionSec)}`, "info");
          push(`[WARNING] Backend telemetry unavailable (${err?.message || "offline"}). Host uptime not exposed.`, "warning");
        }
        break;
      }

      case "uname": {
        const argErr = validateArgs(parsed, { allowedFlags: ["a", "s", "r", "m"], maxPositional: 0, usage: "uname [-a]" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        if (parsed.flags.has("a") || parsed.flags.size === 0) {
          push("AegisOS aegis-ops-core 6.14.0-aegis-vault #1 SMP AegisVault Simulated Kernel x86_64 Sandboxed", "default");
        } else {
          const outParts: string[] = [];
          if (parsed.flags.has("s")) outParts.push("AegisOS");
          if (parsed.flags.has("r")) outParts.push("6.14.0-aegis-vault");
          if (parsed.flags.has("m")) outParts.push("x86_64");
          push(outParts.join(" "), "default");
        }
        break;
      }

      case "echo": {
        push(parsed.args.join(" "), "default");
        break;
      }

      case "history": {
        const argErr = validateArgs(parsed, { maxPositional: 0, usage: "history" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        if (ctx.history.length === 0) {
          push("No prior commands recorded in this session.", "info");
        } else {
          const rows = ctx.history.map((cmdStr, idx) => [`${idx + 1}`, cmdStr]);
          formatGridTable(["#", "COMMAND"], rows, 80).forEach((l) => push(l, "default"));
          push(`[SUCCESS] ${ctx.history.length} command(s) in session history`, "success");
        }
        break;
      }

      case "ps": {
        const argErr = validateArgs(parsed, {
          allowedOptions: ["state"],
          maxPositional: 0,
          usage: "ps [--state RUNNING|READY|WAITING|TERMINATED]",
        });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const procs = await api.getProcesses(parsed.options.state);
        throwIfAborted(ctx.signal);
        const rows = procs.map((p: any) => [
          p.pid,
          p.name,
          p.state,
          `${p.burst_time ?? 0}ms`,
          `${p.cpu_time ?? 0}ms`,
          `${p.priority ?? 0}`,
          `${p.memory ?? 0}MB`,
        ]);
        formatGridTable(["PID", "NAME", "STATE", "BURST", "CPU", "PRIO", "MEM"], rows).forEach((l) => push(l, "default"));
        push(`[SUCCESS] ${procs.length} simulated process(es) retrieved from backend`, "success");
        break;
      }

      case "free": {
        const argErr = validateArgs(parsed, { maxPositional: 0, usage: "free" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const blocks = await api.getMemoryBlocks();
        throwIfAborted(ctx.signal);
        const total = blocks.reduce((acc: number, b: any) => acc + (b.size || 0), 0);
        const used = blocks
          .filter((b: any) => b.status === "ALLOCATED")
          .reduce((acc: number, b: any) => acc + (b.size || 0), 0);
        const free = Math.max(0, total - used);
        const utilPct = total > 0 ? ((used / total) * 100).toFixed(1) : "0.0";

        const summaryRows = [
          ["Mem (Simulated)", `${total} MB`, `${used} MB`, `${free} MB`, `${utilPct}%`],
        ];
        formatGridTable(["POOL", "TOTAL", "USED", "FREE", "UTIL"], summaryRows).forEach((l) => push(l, "default"));
        push("", "default");
        const blockRows = blocks.map((b: any) => [
          b.id,
          b.startAddress || b.start_address || "0x0000",
          `${b.size} MB`,
          b.status,
          b.processId || b.process_id || "-",
        ]);
        formatGridTable(["BLOCK", "ADDR", "SIZE", "STATUS", "PID"], blockRows).forEach((l) => push(l, "default"));
        push(`[SUCCESS] Memory telemetry loaded (${blocks.length} physical segments)`, "success");
        break;
      }

      case "df": {
        const argErr = validateArgs(parsed, { maxPositional: 0, usage: "df" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const st = await api.getStorageStats();
        throwIfAborted(ctx.signal);
        const rows = [
          [
            st.mount_point,
            st.filesystem_type,
            formatBytes(st.total_bytes),
            formatBytes(st.used_bytes),
            formatBytes(st.free_bytes),
            `${st.usage_percent}%`,
            `${st.used_inodes}/${st.total_inodes}`,
          ],
        ];
        formatGridTable(
          ["FILESYSTEM", "TYPE", "SIZE", "USED", "AVAIL", "USE%", "INODES"],
          rows
        ).forEach((l) => push(l, "default"));
        push("[SUCCESS] Virtual filesystem storage statistics retrieved", "success");
        break;
      }

      // =====================================================================
      // 2. VIRTUAL FILESYSTEM COMMANDS (STRICTLY VFS SANDBOX)
      // =====================================================================
      case "pwd": {
        const argErr = validateArgs(parsed, { maxPositional: 0, usage: "pwd" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        push(ctx.cwd, "info");
        break;
      }

      case "cd": {
        const argErr = validateArgs(parsed, { maxPositional: 1, usage: "cd [directory]" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const rawTarget = parsed.positional[0] ?? "/";
        const resolved = normalizeVirtualPath(ctx.cwd, rawTarget);
        const tree: VfsNode[] = await api.getFileTree();
        throwIfAborted(ctx.signal);
        const node = findVfsNode(tree, resolved);
        if (!node) {
          push(`[ERROR] cd: '${resolved}': No such virtual directory`, "error");
          return { status: "ERROR", lines: out, durationMs: Math.round(performance.now() - t0) };
        }
        if (node.type !== "DIRECTORY") {
          push(`[ERROR] cd: '${resolved}': Not a directory`, "error");
          return { status: "ERROR", lines: out, durationMs: Math.round(performance.now() - t0) };
        }
        ctx.setCwd(resolved);
        push(`[VFS] Working directory changed to ${resolved}`, "success");
        break;
      }

      case "ls": {
        const argErr = validateArgs(parsed, {
          allowedFlags: ["l", "a", "la", "al"],
          maxPositional: 1,
          usage: "ls [-la] [path]",
        });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const targetPath = normalizeVirtualPath(ctx.cwd, parsed.positional[0]);
        const longFormat = parsed.flags.has("l") || parsed.flags.has("la") || parsed.flags.has("al");
        const showAll = parsed.flags.has("a") || parsed.flags.has("la") || parsed.flags.has("al");

        const tree: VfsNode[] = await api.getFileTree();
        throwIfAborted(ctx.signal);
        const node = findVfsNode(tree, targetPath);
        if (!node) {
          push(`[ERROR] ls: cannot access '${targetPath}': No such virtual file or directory`, "error");
          return { status: "ERROR", lines: out, durationMs: Math.round(performance.now() - t0) };
        }

        const entries: VfsNode[] = node.type === "DIRECTORY" ? node.children ?? [] : [node];
        if (longFormat) {
          const rows: (string | number)[][] = [];
          if (showAll && node.type === "DIRECTORY") {
            const parentResolved = normalizeVirtualPath(targetPath, "..");
            rows.push([`d${node.permissions}`, "DIR", "aegis", `${node.size}`, node.modified || "-", "."]);
            rows.push(["drwxr-xr-x", "DIR", "aegis", "4096", node.modified || "-", `.. (${parentResolved})`]);
          }
          for (const entry of entries) {
            const modePrefix = entry.type === "DIRECTORY" ? "d" : "-";
            rows.push([
              `${modePrefix}${entry.permissions || "rw-r--r--"}`,
              entry.type === "DIRECTORY" ? "DIR" : "FILE",
              "aegis",
              `${entry.size ?? 0}`,
              entry.modified || "-",
              entry.type === "DIRECTORY" ? `${entry.name}/` : entry.name,
            ]);
          }
          if (rows.length === 0) {
            push(`[VFS] Directory '${targetPath}' is empty.`, "info");
          } else {
            formatGridTable(["PERMS", "TYPE", "OWNER", "BYTES", "MODIFIED", "NAME"], rows).forEach((l) =>
              push(l, "default")
            );
            push(`[SUCCESS] Listed ${entries.length} virtual entry/entries in '${targetPath}'`, "success");
          }
        } else {
          const names: string[] = [];
          if (showAll && node.type === "DIRECTORY") {
            names.push("./", "../");
          }
          for (const entry of entries) {
            names.push(entry.type === "DIRECTORY" ? `${entry.name}/` : entry.name);
          }
          if (names.length === 0) {
            push(`[VFS] Directory '${targetPath}' is empty.`, "info");
          } else {
            push(names.join("   "), "default");
            push(`[SUCCESS] ${entries.length} virtual entry/entries in '${targetPath}'`, "success");
          }
        }
        break;
      }

      case "tree": {
        const argErr = validateArgs(parsed, { maxPositional: 1, usage: "tree [path]" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const targetPath = normalizeVirtualPath(ctx.cwd, parsed.positional[0]);
        const tree: VfsNode[] = await api.getFileTree();
        throwIfAborted(ctx.signal);
        const node = findVfsNode(tree, targetPath);
        if (!node) {
          push(`[ERROR] tree: '${targetPath}': No such virtual file or directory`, "error");
          return { status: "ERROR", lines: out, durationMs: Math.round(performance.now() - t0) };
        }
        push("VIRTUAL FILESYSTEM TOPOLOGY (SANDBOXED):", "info");
        renderAsciiTree(node).forEach((l) => push(l, "default"));
        push("[SUCCESS] Virtual tree rendered", "success");
        break;
      }

      case "cat": {
        const argErr = validateArgs(parsed, { minPositional: 1, maxPositional: 1, usage: "cat <file>" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const targetPath = normalizeVirtualPath(ctx.cwd, parsed.positional[0]);
        const fileData = await api.getFileContent(targetPath);
        throwIfAborted(ctx.signal);
        push(
          `[VFS] ${fileData.path} (${fileData.size} bytes | ${fileData.permissions} | modified ${fileData.modified})`,
          "info"
        );
        const content = fileData.content ?? "";
        if (!content) {
          push("(empty virtual file)", "default");
        } else {
          content.split("\n").forEach((line: string) => push(line, "default"));
        }
        break;
      }

      case "mkdir": {
        const argErr = validateArgs(parsed, { minPositional: 1, maxPositional: 1, usage: "mkdir <name>" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const targetPath = normalizeVirtualPath(ctx.cwd, parsed.positional[0]);
        if (targetPath === "/") {
          push("[ERROR] mkdir: cannot create directory '/': Already exists", "error");
          return { status: "ERROR", lines: out, durationMs: Math.round(performance.now() - t0) };
        }
        const { parentPath, name } = splitParentAndName(targetPath);
        if (!name || name === "." || name === "..") {
          push("[ERROR] mkdir: invalid virtual directory name", "error");
          return { status: "ERROR", lines: out, durationMs: Math.round(performance.now() - t0) };
        }
        const created = await api.createFile({
          name,
          parent_path: parentPath,
          is_directory: true,
          permissions: "rwxr-xr-x",
        });
        throwIfAborted(ctx.signal);
        push(
          `[SUCCESS] Created virtual directory '${created.path}' (inode ${created.id}, exec ${created.execution_id || "vfs"})`,
          "success"
        );
        break;
      }

      case "touch": {
        const argErr = validateArgs(parsed, { minPositional: 1, maxPositional: 1, usage: "touch <file>" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const targetPath = normalizeVirtualPath(ctx.cwd, parsed.positional[0]);
        if (targetPath === "/") {
          push("[ERROR] touch: cannot touch '/': Is root directory", "error");
          return { status: "ERROR", lines: out, durationMs: Math.round(performance.now() - t0) };
        }
        const tree: VfsNode[] = await api.getFileTree();
        throwIfAborted(ctx.signal);
        const existing = findVfsNode(tree, targetPath);
        if (existing) {
          if (existing.type === "DIRECTORY") {
            push(`[ERROR] touch: '${targetPath}' is an existing directory`, "error");
            return { status: "ERROR", lines: out, durationMs: Math.round(performance.now() - t0) };
          }
          const current = await api.getFileContent(targetPath);
          const updated = await api.updateFileContent(targetPath, current.content ?? "");
          push(`[SUCCESS] Updated timestamp on virtual file '${updated.path}' (${updated.modified_at || "now"})`, "success");
          break;
        }
        const { parentPath, name } = splitParentAndName(targetPath);
        const created = await api.createFile({
          name,
          parent_path: parentPath,
          is_directory: false,
          content: "",
          permissions: "rw-r--r--",
        });
        throwIfAborted(ctx.signal);
        push(
          `[SUCCESS] Created virtual file '${created.path}' (inode ${created.id}, exec ${created.execution_id || "vfs"})`,
          "success"
        );
        break;
      }

      // =====================================================================
      // 3. DATABASE COMMANDS (DYNAMIC INTROSPECTION)
      // =====================================================================
      case "db.status": {
        const argErr = validateArgs(parsed, { maxPositional: 0, usage: "db.status" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const ov = await api.getDbOverview();
        throwIfAborted(ctx.signal);
        push(`[DATABASE] Connection Status : ${ov.status || "ONLINE"}`, "success");
        push(`[DATABASE] Database Name     : ${ov.database_name}`, "info");
        push(`[DATABASE] Engine Dialect    : ${ov.dialect}`, "info");
        push(`[DATABASE] Engine Latency    : ${ov.latency_ms} ms`, "default");
        push(`[DATABASE] User Tables       : ${ov.total_tables}`, "default");
        push(`[DATABASE] SQL Views         : ${ov.total_views ?? 0}`, "default");
        push(`[DATABASE] Foreign Keys      : ${ov.foreign_keys_count}`, "default");
        push(`[DATABASE] Total Records     : ${(ov.total_records ?? 0).toLocaleString()}`, "default");
        break;
      }

      case "db.tables": {
        const argErr = validateArgs(parsed, {
          allowedFlags: ["system"],
          maxPositional: 0,
          usage: "db.tables [--system]",
        });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const includeSystem = parsed.flags.has("system");
        const tables = await api.getTables("ALL", includeSystem, "TABLE");
        throwIfAborted(ctx.signal);
        const rows = tables.map((t: any) => [
          t.schema_name || "main",
          t.name,
          t.is_system ? "SYSTEM" : "TABLE",
          t.column_count ?? t.columns?.length ?? 0,
          t.count_is_estimated ? `~${(t.rows ?? 0).toLocaleString()} (est)` : (t.rows ?? 0).toLocaleString(),
          t.primary_key || "NONE",
        ]);
        formatGridTable(["SCHEMA", "TABLE NAME", "KIND", "COLS", "ROWS", "PRIMARY KEY"], rows).forEach((l) =>
          push(l, "default")
        );
        push(`[SUCCESS] Discovered ${tables.length} database table(s)`, "success");
        break;
      }

      case "db.views": {
        const argErr = validateArgs(parsed, { maxPositional: 0, usage: "db.views" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const views = await api.getViews("ALL");
        throwIfAborted(ctx.signal);
        if (!views || views.length === 0) {
          push("[DATABASE] No accessible SQL views found.", "info");
        } else {
          const rows = views.map((v: any) => [
            v.schema_name || "main",
            v.name,
            v.column_count ?? v.columns?.length ?? 0,
            v.count_is_estimated ? `~${(v.rows ?? 0).toLocaleString()} (est)` : (v.rows ?? 0).toLocaleString(),
            "READ_ONLY",
          ]);
          formatGridTable(["SCHEMA", "VIEW NAME", "COLS", "ROWS", "ACCESS"], rows).forEach((l) => push(l, "default"));
          push(`[SUCCESS] Discovered ${views.length} SQL view(s)`, "success");
        }
        break;
      }

      case "db.describe": {
        const argErr = validateArgs(parsed, { minPositional: 1, maxPositional: 1, usage: "db.describe <table>" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const rawTarget = parsed.positional[0];
        if (!isValidDbIdentifier(rawTarget)) {
          push(`[SECURITY] Rejected invalid database identifier '${rawTarget}'.`, "security");
          return { status: "ERROR", lines: out, durationMs: Math.round(performance.now() - t0) };
        }
        const { schemaName, tableName } = splitSchemaTable(rawTarget);
        const schema = await api.getTableSchema(tableName, schemaName, true);
        throwIfAborted(ctx.signal);

        push(
          `[DATABASE] ${schema.object_type || "TABLE"} '${schema.table_name}' (schema: ${schema.schema_name || "main"}${schema.is_system ? ", SYSTEM" : ""})`,
          "info"
        );
        const rows = (schema.columns || []).map((c: any) => {
          const fk = (schema.foreign_keys || []).find((f: any) => f.constrained_columns?.includes(c.name));
          const fkStr = fk ? `-> ${fk.referred_table}.${fk.referred_columns?.join(",")}` : "-";
          return [
            c.name,
            c.type,
            c.nullable ? "YES" : "NO",
            c.primary_key ? "PK" : "-",
            fkStr,
            c.default !== null && c.default !== undefined ? String(c.default) : "NULL",
          ];
        });
        formatGridTable(["COLUMN", "TYPE", "NULL", "KEY", "FOREIGN KEY", "DEFAULT"], rows).forEach((l) =>
          push(l, "default")
        );
        if (schema.view_definition) {
          push("", "default");
          push("[VIEW DEFINITION SQL]", "info");
          push(`  ${schema.view_definition}`, "default");
        }
        const countLabel = schema.count_is_estimated
          ? `~${schema.row_count} (estimated)`
          : `${schema.row_count} (exact)`;
        push(
          `[SUCCESS] ${schema.columns?.length ?? 0} columns | ${countLabel} rows | Indexes: ${schema.indexes?.length ?? 0} | Size: ${schema.size_formatted}`,
          "success"
        );
        break;
      }

      case "db.select": {
        const argErr = validateArgs(parsed, {
          allowedOptions: ["limit", "page", "sort"],
          minPositional: 1,
          maxPositional: 1,
          usage: "db.select <table> [--limit N] [--page P] [--sort col]",
        });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const rawTarget = parsed.positional[0];
        if (!isValidDbIdentifier(rawTarget)) {
          push(`[SECURITY] Rejected invalid database identifier '${rawTarget}'.`, "security");
          return { status: "ERROR", lines: out, durationMs: Math.round(performance.now() - t0) };
        }
        if (parsed.options.sort && !isValidDbIdentifier(parsed.options.sort)) {
          push(`[SECURITY] Rejected invalid sort column '${parsed.options.sort}'.`, "security");
          return { status: "ERROR", lines: out, durationMs: Math.round(performance.now() - t0) };
        }
        const limit = parsePositiveIntOption(parsed.options.limit, 15, 100);
        const page = parsePositiveIntOption(parsed.options.page, 1, 10000);
        const { schemaName, tableName } = splitSchemaTable(rawTarget);

        const res = await api.getTableRecords(tableName, {
          schema_name: schemaName,
          include_system: true,
          page,
          page_size: limit,
          sort_by: parsed.options.sort,
        });
        throwIfAborted(ctx.signal);

        const cols: string[] = res.columns || [];
        const rows = (res.rows || []).map((r: any) => cols.map((c) => r[c]));
        formatGridTable(cols, rows).forEach((l) => push(l, "default"));
        const countText = res.count_is_estimated
          ? `~${res.total_count ?? 0} estimated`
          : `${res.total_count ?? 0} exact`;
        push(
          `[SUCCESS] Page ${res.page ?? page}/${res.total_pages ?? 1} | Showing ${res.rows?.length ?? 0} of ${countText} row(s) from '${tableName}'`,
          "success"
        );
        break;
      }

      case "db.count": {
        const argErr = validateArgs(parsed, { minPositional: 1, maxPositional: 1, usage: "db.count <table>" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const rawTarget = parsed.positional[0];
        if (!isValidDbIdentifier(rawTarget)) {
          push(`[SECURITY] Rejected invalid database identifier '${rawTarget}'.`, "security");
          return { status: "ERROR", lines: out, durationMs: Math.round(performance.now() - t0) };
        }
        const { schemaName, tableName } = splitSchemaTable(rawTarget);
        const schema = await api.getTableSchema(tableName, schemaName, true);
        throwIfAborted(ctx.signal);
        push(`[DATABASE] Object    : ${schema.table_name} (${schema.object_type || "TABLE"})`, "info");
        push(
          `[DATABASE] Row Count : ${(schema.row_count ?? 0).toLocaleString()} (${schema.count_is_estimated ? "ESTIMATED" : "EXACT"})`,
          "success"
        );
        push(`[DATABASE] Columns   : ${schema.columns?.length ?? 0}`, "default");
        push(`[DATABASE] Footprint : ${schema.size_formatted ?? "Unknown"}`, "default");
        break;
      }

      case "db.keys": {
        const argErr = validateArgs(parsed, { minPositional: 1, maxPositional: 1, usage: "db.keys <table>" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const rawTarget = parsed.positional[0];
        if (!isValidDbIdentifier(rawTarget)) {
          push(`[SECURITY] Rejected invalid database identifier '${rawTarget}'.`, "security");
          return { status: "ERROR", lines: out, durationMs: Math.round(performance.now() - t0) };
        }
        const { schemaName, tableName } = splitSchemaTable(rawTarget);
        const schema = await api.getTableSchema(tableName, schemaName, true);
        throwIfAborted(ctx.signal);
        push(`[DATABASE] Keys & Indexes for '${schema.table_name}':`, "info");
        push(`  Primary Keys : ${schema.primary_keys?.length ? schema.primary_keys.join(", ") : "None declared"}`, "default");
        if (schema.foreign_keys && schema.foreign_keys.length > 0) {
          push("  Foreign Keys :", "default");
          schema.foreign_keys.forEach((fk: any) => {
            push(
              `    ${fk.constrained_columns?.join(", ")} -> ${fk.referred_table}(${fk.referred_columns?.join(", ")}) [${fk.name || "fk"}]`,
              "default"
            );
          });
        } else {
          push("  Foreign Keys : None", "default");
        }
        if (schema.indexes && schema.indexes.length > 0) {
          push("  Indexes      :", "default");
          schema.indexes.forEach((idx: any) => {
            push(
              `    ${idx.name || "idx"} (${(idx.column_names || idx.columns || []).join(", ")}) [${idx.unique ? "UNIQUE" : "INDEX"}]`,
              "default"
            );
          });
        }
        push("[SUCCESS] Key introspection complete", "success");
        break;
      }

      case "db.relationships": {
        const argErr = validateArgs(parsed, { maxPositional: 0, usage: "db.relationships" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const rels = await api.getDbRelationships();
        throwIfAborted(ctx.signal);
        if (!rels || rels.length === 0) {
          push("[DATABASE] No foreign key relationships discovered.", "info");
        } else {
          const rows = rels.map((r: any) => [
            `${r.source_table}.${r.source_column}`,
            "->",
            `${r.target_table}.${r.target_column}`,
            r.cardinality || "N:1",
            r.is_physical ? "PHYSICAL FK" : "LOGICAL",
            r.constraint_name || "fk",
          ]);
          formatGridTable(["SOURCE", "", "TARGET", "CARD", "TYPE", "CONSTRAINT"], rows).forEach((l) =>
            push(l, "default")
          );
          push(`[SUCCESS] Discovered ${rels.length} relational dependency/dependencies`, "success");
        }
        break;
      }

      // =====================================================================
      // 4. AEGISVAULT SUBSYSTEM COMMANDS (AVX.*)
      // =====================================================================
      case "avx.status": {
        const argErr = validateArgs(parsed, { maxPositional: 0, usage: "avx.status" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };

        const [healthR, metricsR, dbR, execR] = await Promise.allSettled([
          api.getHealth(),
          api.getSystemMetrics(),
          api.getDbOverview(),
          api.getExecutionHistory("ALL", 1),
        ]);
        throwIfAborted(ctx.signal);

        const healthOk = healthR.status === "fulfilled";
        const metrics = metricsR.status === "fulfilled" ? metricsR.value : null;
        const dbOv = dbR.status === "fulfilled" ? dbR.value : null;
        const latestExec = execR.status === "fulfilled" && execR.value.length > 0 ? execR.value[0] : null;

        push("AEGISVAULT CORE STATUS:", "header");
        push(`  API Health       : ${healthOk ? `ONLINE (${healthR.value.message})` : "OFFLINE"}`, healthOk ? "success" : "error");
        push(
          `  Database Engine  : ${dbOv ? `${dbOv.status} | ${dbOv.dialect} (${dbOv.database_name}) @ ${dbOv.latency_ms}ms | ${dbOv.total_tables} tables / ${dbOv.total_views ?? 0} views` : "UNAVAILABLE"}`,
          dbOv ? "info" : "error"
        );
        if (metrics) {
          push(
            `  Compute Load     : CPU ${metrics.cpu_utilization}% | MEM ${metrics.memory_utilization}% | Thermal ${metrics.temperature}C | Net ${metrics.network_throughput_kb} KB/s`,
            "default"
          );
          push(
            `  Workload Queues  : Active Procs ${metrics.active_processes} | Disk Pending ${metrics.disk_queue} | Active TX ${metrics.active_transactions}`,
            "default"
          );
          if (typeof metrics.uptime_seconds === "number") {
            push(`  Backend Uptime   : ${formatUptime(metrics.uptime_seconds)}`, "default");
          }
        } else {
          push("  System Telemetry : UNAVAILABLE", "warning");
        }
        push(
          `  Latest Execution : ${latestExec ? `${latestExec.execution_id} (${latestExec.module} / ${latestExec.algorithm} - ${latestExec.status})` : "No executions recorded"}`,
          "default"
        );
        if (!healthOk && !dbOv) {
          return { status: "ERROR", lines: out, durationMs: Math.round(performance.now() - t0) };
        }
        break;
      }

      case "avx.modules": {
        const argErr = validateArgs(parsed, { maxPositional: 0, usage: "avx.modules" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };

        const probes = await Promise.allSettled([
          api.getProcesses(),
          api.getSchedulingHistory(5),
          api.getMemoryBlocks(),
          api.getDiskRequests(),
          api.getFileTree(),
          api.getDbOverview(),
          api.getTransactions(),
          api.getExecutionHistory("ALL", 5),
          api.getEvents({ limit: 5 }),
          api.getSystemMetrics(),
        ]);
        throwIfAborted(ctx.signal);

        const describeProbe = (res: PromiseSettledResult<any>, fmt: (v: any) => string): [string, string] =>
          res.status === "fulfilled" ? ["ONLINE", fmt(res.value)] : ["UNAVAILABLE", res.reason?.message || "Endpoint failed"];

        const rows = [
          ["process_manager", "OS", ...describeProbe(probes[0], (v) => `${v.length} process(es)`)],
          ["cpu_scheduler", "OS", ...describeProbe(probes[1], (v) => `${v.length} recent run(s)`)],
          ["memory_manager", "OS", ...describeProbe(probes[2], (v) => `${v.length} segment(s)`)],
          ["paging_engine", "OS", "READY", "On-demand simulator / process paging"],
          ["disk_scheduler", "OS", ...describeProbe(probes[3], (v) => `${v.length} disk request(s)`)],
          ["virtual_fs", "OS", ...describeProbe(probes[4], (v) => `${v.length} root mount(s)`)],
          ["dbms_observatory", "DBMS", ...describeProbe(probes[5], (v) => `${v.total_tables} tables, ${v.total_views ?? 0} views`)],
          ["transactions", "DBMS", ...describeProbe(probes[6], (v) => `${v.length} tx record(s)`)],
          ["execution_trace", "ANALYTICS", ...describeProbe(probes[7], (v) => `${v.length} recent trace(s)`)],
          ["event_logs", "ANALYTICS", ...describeProbe(probes[8], (v) => `${v.length} recent event(s)`)],
          ["system_monitor", "ANALYTICS", ...describeProbe(probes[9], (v) => `CPU ${v.cpu_utilization}%, MEM ${v.memory_utilization}%`)],
        ];
        formatGridTable(["MODULE", "GROUP", "STATUS", "LIVE TELEMETRY"], rows).forEach((l) => push(l, "default"));
        const offlineCount = probes.filter((p) => p.status === "rejected").length;
        if (offlineCount > 0) {
          push(`[WARNING] ${offlineCount} backend subsystem probe(s) unreachable`, "warning");
        } else {
          push("[SUCCESS] All probed AegisVault modules responded with live state", "success");
        }
        break;
      }

      case "avx.executions": {
        const argErr = validateArgs(parsed, {
          allowedOptions: ["limit"],
          maxPositional: 1,
          usage: "avx.executions [module] [--limit N]",
        });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const moduleFilter = parsed.positional[0] || "ALL";
        const limit = parsePositiveIntOption(parsed.options.limit, 15, 100);
        const history = await api.getExecutionHistory(moduleFilter, limit);
        throwIfAborted(ctx.signal);
        if (history.length === 0) {
          push(`[AEGIS] No executions recorded for module '${moduleFilter}'.`, "info");
        } else {
          const rows = history.map((h: any) => [
            h.execution_id,
            h.module,
            h.algorithm,
            h.status,
            h.total_steps,
            h.created_at,
          ]);
          formatGridTable(["EXECUTION ID", "MODULE", "ALGORITHM", "STATUS", "STEPS", "CREATED AT"], rows).forEach((l) =>
            push(l, "default")
          );
          push(`[SUCCESS] Retrieved ${history.length} execution record(s)`, "success");
        }
        break;
      }

      case "avx.trace.latest": {
        const argErr = validateArgs(parsed, { maxPositional: 1, usage: "avx.trace.latest [execution_id]" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };

        let execId = parsed.positional[0];
        if (!execId) {
          const history = await api.getExecutionHistory("ALL", 1);
          throwIfAborted(ctx.signal);
          if (!history || history.length === 0) {
            push("[TRACE] No execution traces exist yet in the backend database.", "info");
            break;
          }
          execId = history[0].execution_id;
        }

        const exec = await api.getExecution(execId);
        throwIfAborted(ctx.signal);
        push(`[TRACE] Execution ID : ${exec.execution_id}`, "info");
        push(`  Module    : ${exec.module}`, "default");
        push(`  Algorithm : ${exec.algorithm}`, "default");
        push(`  Status    : ${exec.status}`, "default");
        push(`  Steps     : ${exec.total_steps}`, "default");
        push(`  Timestamp : ${exec.created_at}`, "default");

        if (exec.trace_events && exec.trace_events.length > 0) {
          push("", "default");
          const rows = exec.trace_events.slice(0, 20).map((ev: any) => [
            ev.step_number,
            ev.simulation_time,
            ev.operation,
            ev.entity,
            ev.status || "SUCCESS",
            ev.reason || "",
          ]);
          formatGridTable(["STEP", "T", "OPERATION", "ENTITY", "STATUS", "REASON"], rows, 44).forEach((l) =>
            push(l, "default")
          );
          if (exec.trace_events.length > 20) {
            push(`... (${exec.trace_events.length - 20} additional step(s) truncated)`, "info");
          }
        } else {
          push("  No granular trace events attached to this execution.", "warning");
        }
        push("[SUCCESS] Trace loaded from execution engine", "success");
        break;
      }

      case "avx.processes": {
        const argErr = validateArgs(parsed, {
          allowedOptions: ["state"],
          maxPositional: 0,
          usage: "avx.processes [--state RUNNING|READY|WAITING|TERMINATED]",
        });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const procs = await api.getProcesses(parsed.options.state);
        throwIfAborted(ctx.signal);
        const rows = procs.map((p: any) => [
          p.pid,
          p.name,
          p.state,
          `${p.arrival_time ?? 0}ms`,
          `${p.burst_time ?? 0}ms`,
          `${p.cpu_time ?? 0}ms`,
          p.priority,
          `${p.memory}MB`,
        ]);
        formatGridTable(["PID", "NAME", "STATE", "ARR", "BURST", "CPU", "PRIO", "RAM"], rows).forEach((l) =>
          push(l, "default")
        );
        push(`[SUCCESS] Loaded ${procs.length} process control block(s)`, "success");
        break;
      }

      case "avx.scheduler": {
        const argErr = validateArgs(parsed, {
          allowedOptions: ["limit"],
          maxPositional: 0,
          usage: "avx.scheduler [--limit N]",
        });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const limit = parsePositiveIntOption(parsed.options.limit, 10, 50);
        const runs = await api.getSchedulingHistory(limit);
        throwIfAborted(ctx.signal);
        if (runs.length === 0) {
          push("[SCHEDULER] No CPU scheduling simulations recorded yet.", "info");
        } else {
          const rows = runs.map((r: any) => [
            r.id,
            r.algorithm,
            r.quantum ?? "-",
            `${Number(r.cpu_utilization ?? 0).toFixed(1)}%`,
            `${Number(r.average_waiting_time ?? 0).toFixed(2)}ms`,
            `${Number(r.average_turnaround_time ?? 0).toFixed(2)}ms`,
            `${Number(r.average_response_time ?? 0).toFixed(2)}ms`,
            r.timestamp || "-",
          ]);
          formatGridTable(
            ["RUN", "ALGORITHM", "Q", "CPU%", "AVG WAIT", "AVG TAT", "AVG RESP", "TIME"],
            rows
          ).forEach((l) => push(l, "default"));
          push(`[SUCCESS] Retrieved ${runs.length} scheduler run(s)`, "success");
        }
        break;
      }

      case "avx.memory": {
        const argErr = validateArgs(parsed, { maxPositional: 0, usage: "avx.memory" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const [blocks, hist] = await Promise.all([api.getMemoryBlocks(), api.getMemoryHistory(5)]);
        throwIfAborted(ctx.signal);

        push("[MEMORY] Physical Partition Map:", "info");
        const blockRows = blocks.map((b: any) => [
          b.id,
          b.startAddress || b.start_address,
          `${b.size} MB`,
          b.status,
          b.processId || b.process_id || "-",
        ]);
        formatGridTable(["ID", "ADDR", "SIZE", "STATUS", "PID"], blockRows).forEach((l) => push(l, "default"));

        if (hist.length > 0) {
          push("", "default");
          push("[MEMORY] Recent Allocation Simulation Runs:", "info");
          const histRows = hist.map((h: any) => [
            h.id,
            h.algorithm,
            `${h.allocated_memory} MB`,
            `${h.free_memory} MB`,
            `${h.fragmentation} MB`,
            h.timestamp || "-",
          ]);
          formatGridTable(["RUN", "ALGO", "ALLOCATED", "FREE", "FRAG", "TIME"], histRows).forEach((l) =>
            push(l, "default")
          );
        } else {
          push("[MEMORY] No memory allocation simulations run yet.", "info");
        }
        push("[SUCCESS] Memory state synchronized", "success");
        break;
      }

      case "avx.disk": {
        const argErr = validateArgs(parsed, { maxPositional: 0, usage: "avx.disk" });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const [requests, hist] = await Promise.all([api.getDiskRequests(), api.getDiskHistory(5)]);
        throwIfAborted(ctx.signal);

        push("[DISK] Active I/O Request Queue:", "info");
        if (requests.length === 0) {
          push("  Queue empty.", "info");
        } else {
          const reqRows = requests.map((r: any) => [r.id, r.track, r.sector, r.status]);
          formatGridTable(["REQ ID", "TRACK", "SECTOR", "STATUS"], reqRows).forEach((l) => push(l, "default"));
        }

        if (hist.length > 0) {
          push("", "default");
          push("[DISK] Recent Head Scheduling Runs:", "info");
          const hRows = hist.map((h: any) => [
            h.id,
            h.algorithm,
            h.initial_head,
            h.total_head_movement,
            Number(h.average_seek_time ?? 0).toFixed(2),
            h.timestamp || "-",
          ]);
          formatGridTable(["RUN", "ALGO", "HEAD", "SEEK DIST", "AVG SEEK", "TIME"], hRows).forEach((l) =>
            push(l, "default")
          );
        } else {
          push("[DISK] No disk scheduling simulations run yet.", "info");
        }
        push("[SUCCESS] Disk subsystem state synchronized", "success");
        break;
      }

      case "avx.logs": {
        const argErr = validateArgs(parsed, {
          allowedOptions: ["limit", "severity", "module"],
          maxPositional: 0,
          usage: "avx.logs [--limit N] [--severity INFO|WARNING|ERROR] [--module MOD]",
        });
        if (argErr) return { status: "ERROR", lines: [{ text: argErr, type: "error" }], durationMs: 0 };
        const limit = parsePositiveIntOption(parsed.options.limit, 12, 100);
        const events = await api.getEvents({
          limit,
          severity: parsed.options.severity,
          module: parsed.options.module,
        });
        throwIfAborted(ctx.signal);
        if (events.length === 0) {
          push("[LOGS] No matching system events found.", "info");
        } else {
          const rows = events.map((e: any) => [
            e.timestamp,
            e.module,
            e.severity,
            e.event,
            e.entity || "-",
            e.description || "",
          ]);
          formatGridTable(["TIME", "MODULE", "SEV", "EVENT", "ENTITY", "DESCRIPTION"], rows, 46).forEach((l) =>
            push(l, "default")
          );
          push(`[SUCCESS] Loaded ${events.length} system log entry/entries`, "success");
        }
        break;
      }
    }

    return {
      status: "SUCCESS",
      lines: out,
      durationMs: Math.round(performance.now() - t0),
    };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return {
        status: "CANCELLED",
        lines: [{ text: "^C [CANCELLED] Execution interrupted by operator.", type: "warning" }],
        durationMs: Math.round(performance.now() - t0),
      };
    }
    return {
      status: "ERROR",
      lines: [{ text: `[ERROR] ${err?.message || String(err)}`, type: "error" }],
      durationMs: Math.round(performance.now() - t0),
    };
  }
}

