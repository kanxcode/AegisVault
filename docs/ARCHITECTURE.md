# AegisVault Architecture Overview

## 1. Execution & Trace Engine (`backend/app/os_engine/trace_engine.py`)

Every OS simulation, virtual filesystem mutation, transaction action, and database operation emits structured `TraceEvent` records via `TraceCollector`:
- Captures simulation timestamp, operation, target entity, action, human-readable reason & explanation, structured calculation payloads, and `state_before` / `state_after` snapshots.
- Persists completed runs into `executions` (`ExecutionModel`) so historical traces can be replayed via `/api/executions/history` and `/api/executions/{execution_id}` or inspected from the UI and Command Console (`avx.trace.latest`).

---

## 2. Database Observatory (`backend/app/api/dbms.py`)

### Dynamic Catalog Discovery
- Uses SQLAlchemy's runtime `inspect(engine)` instead of hardcoded schema lists.
- Supports both **SQLite** and **MySQL** dialects cleanly:
  - Discovers schemas, user tables, read-only SQL views, and (when `include_system=true`) engine system tables.
  - Exposes view SQL definitions (`get_view_definition`), column metadata, primary keys, foreign keys, and indexes.

### Safe Identifier & Query Handling
- `_validate_identifier` enforces strict identifier syntax (`^[A-Za-z_][A-Za-z0-9_]*$`) before quoting with dialect-specific quotes (`_quote_ident` / `_qualify_object`).
- Server-side paginated browsing (`GET /api/db/tables/{name}/records`) caps page size and tracks whether row counts are exact or estimated (`count_is_estimated` for tables exceeding `LARGE_TABLE_ESTIMATE_THRESHOLD = 50,000`).
- `POST /api/db/operations/execute` enforces parameterized SQLAlchemy statements for `SELECT`, `INSERT`, `UPDATE`, and `DELETE`, while rejecting write operations against SQL views and system tables.
- `POST /api/db/sql` parses query classification, filters restricted engine directives (`PRAGMA`, `ATTACH`, `DETACH`, `LOAD_EXTENSION`, `VACUUM`, `SQLITE_MASTER` mutations), and attaches a logical execution plan and trace.

---

## 3. Sandboxed Command Console (`src/lib/terminal/` & `src/pages/CommandTerminal.tsx`)

The Command Console is a sandboxed application interpreter rather than a host shell:
- **Parser (`parser.ts`)**: Tokenizes quoted strings cleanly while rejecting unquoted shell control/injection constructs (`;`, `&&`, `||`, `|`, `` ` ``, `$(`, `${`, `>`, `<`, `&`) and blocked host binaries (`sh`, `bash`, `sudo`, `rm`, `curl`, `sql`, etc.).
- **Registry (`registry.ts`)**: Maintains explicit command metadata and ensures only registered commands execute.
- **VFS Sandbox (`vfs.ts`)**: Resolves `.` / `..` strictly within the virtual `/` root backed by `/api/files/*` (`virtual_files` table).
- **Executor (`executor.ts`)**: Dispatches `basic`, virtual filesystem, read-only parameterized `db.*`, and `avx.*` subsystem commands against the live FastAPI API with `AbortSignal` (`Ctrl+C`) cancellation support.
