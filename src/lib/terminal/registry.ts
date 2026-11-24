export type CommandCategory = "BASIC" | "FILESYSTEM" | "DATABASE" | "AEGISVAULT";

export interface CommandDefinition {
  name: string;
  category: CommandCategory;
  usage: string;
  description: string;
  suggestions?: string[];
}

export const COMMAND_DEFINITIONS: CommandDefinition[] = [
  // Basic OS & Session Commands
  { name: "help", category: "BASIC", usage: "help [command]", description: "Display command reference or usage for a specific command" },
  { name: "clear", category: "BASIC", usage: "clear", description: "Clear terminal output buffer (shortcut: Ctrl+L)" },
  { name: "whoami", category: "BASIC", usage: "whoami", description: "Show current sandbox operator identity and privilege context" },
  { name: "hostname", category: "BASIC", usage: "hostname", description: "Show sandboxed AegisVault node hostname" },
  { name: "date", category: "BASIC", usage: "date", description: "Print current system UTC and local timestamp" },
  { name: "uptime", category: "BASIC", usage: "uptime", description: "Display backend service uptime and live workload summary" },
  { name: "history", category: "BASIC", usage: "history", description: "Show executed command history for this session" },
  { name: "echo", category: "BASIC", usage: "echo <text...>", description: "Print literal text arguments (supports quoted strings)" },
  { name: "uname", category: "BASIC", usage: "uname [-a]", description: "Display sandboxed kernel and architecture identity", suggestions: ["uname -a"] },
  { name: "ps", category: "BASIC", usage: "ps [--state STATE]", description: "List active simulated OS processes from backend state" },
  { name: "free", category: "BASIC", usage: "free", description: "Show simulated physical RAM partitions and allocation totals" },
  { name: "df", category: "BASIC", usage: "df", description: "Show virtual filesystem storage capacity and inode usage" },

  // Virtual Filesystem Commands (strictly VFS-only)
  { name: "pwd", category: "FILESYSTEM", usage: "pwd", description: "Print current working directory in the virtual filesystem" },
  { name: "ls", category: "FILESYSTEM", usage: "ls [-la] [path]", description: "List virtual directory entries or long metadata", suggestions: ["ls -la"] },
  { name: "cd", category: "FILESYSTEM", usage: "cd [directory]", description: "Change working directory inside the virtual filesystem" },
  { name: "tree", category: "FILESYSTEM", usage: "tree [path]", description: "Render hierarchical virtual filesystem tree" },
  { name: "cat", category: "FILESYSTEM", usage: "cat <file>", description: "Display contents of a virtual file" },
  { name: "mkdir", category: "FILESYSTEM", usage: "mkdir <name>", description: "Create a new directory inside the virtual filesystem" },
  { name: "touch", category: "FILESYSTEM", usage: "touch <file>", description: "Create an empty virtual file or update modified timestamp" },

  // Database Inspection Commands (dynamic SQLAlchemy introspection)
  { name: "db.status", category: "DATABASE", usage: "db.status", description: "Display database connection status, dialect, and latency" },
  { name: "db.tables", category: "DATABASE", usage: "db.tables [--system]", description: "List dynamically discovered tables and row counts" },
  { name: "db.views", category: "DATABASE", usage: "db.views", description: "List dynamically discovered read-only SQL views" },
  { name: "db.describe", category: "DATABASE", usage: "db.describe <table>", description: "Inspect columns, types, nullability, PK/FK, and DDL" },
  { name: "db.select", category: "DATABASE", usage: "db.select <table> [--limit N] [--page P]", description: "Fetch paginated records from a table or view safely" },
  { name: "db.count", category: "DATABASE", usage: "db.count <table>", description: "Retrieve row count (exact vs estimated) and footprint" },
  { name: "db.keys", category: "DATABASE", usage: "db.keys <table>", description: "Inspect primary keys, foreign keys, and unique indexes" },
  { name: "db.relationships", category: "DATABASE", usage: "db.relationships", description: "List all discovered foreign-key relationships across tables" },

  // AegisVault Subsystem Commands
  { name: "avx.status", category: "AEGISVAULT", usage: "avx.status", description: "Aggregate health, DB connectivity, and live simulation metrics" },
  { name: "avx.modules", category: "AEGISVAULT", usage: "avx.modules", description: "Probe operational status of AegisVault OS & DB subsystems" },
  { name: "avx.executions", category: "AEGISVAULT", usage: "avx.executions [module] [--limit N]", description: "List recent simulation execution runs and step counts" },
  { name: "avx.trace.latest", category: "AEGISVAULT", usage: "avx.trace.latest [execution_id]", description: "Inspect decision trace steps for the latest (or given) execution" },
  { name: "avx.processes", category: "AEGISVAULT", usage: "avx.processes [--state STATE]", description: "List detailed simulated process PCBs from backend" },
  { name: "avx.scheduler", category: "AEGISVAULT", usage: "avx.scheduler [--limit N]", description: "Display CPU scheduler simulation runs and efficiency metrics" },
  { name: "avx.memory", category: "AEGISVAULT", usage: "avx.memory", description: "Inspect physical memory blocks and allocation simulation history" },
  { name: "avx.disk", category: "AEGISVAULT", usage: "avx.disk", description: "Inspect disk I/O queue and head movement simulation runs" },
  { name: "avx.logs", category: "AEGISVAULT", usage: "avx.logs [--limit N] [--severity LVL] [--module MOD]", description: "Read filtered audit/system events from the backend log store" },
];

export const REGISTERED_COMMANDS = new Set(COMMAND_DEFINITIONS.map((c) => c.name));

export const AUTOCOMPLETE_ENTRIES: string[] = Array.from(
  new Set(
    COMMAND_DEFINITIONS.flatMap((c) => [c.name, ...(c.suggestions ?? [])])
  )
);

export function findCommandDefinition(name: string): CommandDefinition | undefined {
  return COMMAND_DEFINITIONS.find((c) => c.name === name.toLowerCase());
}

