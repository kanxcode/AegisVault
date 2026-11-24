# AegisVault Backend

This is the Python backend foundation for the AegisVault OS simulation and DBMS Observatory platform.

> **IMPORTANT**: All operating system, filesystem, process, memory, disk, and transaction operations are application-level simulations backed by SQLAlchemy. They do not modify the host OS kernel, hardware, or host filesystem.

---

## Architecture

Built with:
- **FastAPI**: REST API framework (`/api/*`).
- **SQLAlchemy**: ORM and dynamic catalog introspection (`sqlite` / `mysql+pymysql`).
- **Pydantic**: Strict request/response schema validation.
- **Pytest**: Unit and FastAPI `TestClient` integration tests.

Package layout:
- `app/api`: FastAPI route modules (processes, scheduling, memory, paging, disk, files, dbms, transactions, executions, events, system).
- `app/os_engine`: Pure simulation engines for CPU scheduling, memory allocation, paging/MMU translation, disk scheduling, and deterministic trace collection (`trace_engine.py`).
- `app/models`: SQLAlchemy models (`simulation.py`) and declarative base (`base.py`).
- `app/schemas`: Pydantic schemas per module.
- `app/database`: Database engine setup (`connection.py`) and initial seed + SQL view creation (`seed.py`).

---

## Setup (Linux)

1. Navigate to the `backend` directory and create a virtual environment:
   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies from the repository root `requirements.txt`:
   ```bash
   pip install -r ../requirements.txt
   ```

3. Run the development server:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

   Or run without activating the virtual environment:
   ```bash
   cd backend && .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

---

## Environment Variables

- `DATABASE_URL`: Database connection string (defaults to `sqlite:///./aegis.db`).
  For MySQL: `mysql+pymysql://user:pass@localhost:3306/aegis` (see `../.env.example`).

---

## Mounted API Routers

- `/api/health` — Backend liveness probe (`GET /api/health`)
- `/api/processes` — Simulated process CRUD, lifecycle transitions, and reset
- `/api/scheduling` — CPU scheduler simulation (`run`, `history`)
- `/api/memory` — Contiguous memory partition map, allocation simulator, and history
- `/api/paging` — Per-process page table/TLB lookup, page replacement simulation, MMU address translation
- `/api/disk` — Disk I/O request queue and head scheduling simulation (`history`)
- `/api/files` — Sandboxed database-backed virtual filesystem (`/tree`, `/directory`, `/content`, `/rename`, `/storage`)
- `/api/db` — DBMS Observatory (`/schemas`, `/tables`, `/views`, `/overview`, `/relationships`, `/tables/{name}/schema`, `/tables/{name}/records`, `/operations/execute`, `/sql`)
- `/api/transactions` — Simulated ACID transaction begin/commit/rollback, lock inspection, and deadlock simulation
- `/api/executions` — Unified execution history, step-by-step trace retrieval, and CPU/Memory/Disk comparison endpoints
- `/api/events` — System telemetry event creation, filtered retrieval, export (`csv`/`json`), and clearing
- `/api/system` — Real-time simulated compute load, queues, telemetry points, and backend `uptime_seconds`

---

## OS Algorithms Implemented

- **CPU Scheduling**: `FCFS`, `SJF` (non-preemptive), `ROUND_ROBIN` / `RR`, `PRIORITY` (non-preemptive; lower numeric priority executes first)
- **Memory Allocation**: `FIRST_FIT`, `BEST_FIT`, `WORST_FIT` with dynamic block splitting and fragmentation calculation
- **Paging & MMU**: `FIFO`, `LRU`, `OPTIMAL` page replacement plus TLB + page-table address translation
- **Disk Scheduling**: `FCFS`, `SSTF`, `SCAN`, `C-SCAN` with configurable direction (`LEFT` / `RIGHT`) and disk size

---

## Testing

Run the full test suite from `backend/`:

```bash
.venv/bin/pytest
```
