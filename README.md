# AegisVault

AegisVault is an application-level operating system simulation and database observatory platform built with **React**, **TypeScript**, **Vite**, **Zustand**, **FastAPI**, and **SQLAlchemy**.

> **Important:** All operating system, filesystem, scheduling, memory, and terminal operations are application-level simulations backed by AegisVault's database and Python OS engine. They do not inspect or modify the host operating system kernel, hardware, or host filesystem.

---

## Core Modules

### System Operations (Simulated OS)
- **Process Manager (`/os/processes`)**: Create, inspect, and transition simulated Process Control Blocks (`NEW`, `READY`, `RUNNING`, `WAITING`, `TERMINATED`) with execution trace logging.
- **CPU Scheduler (`/os/scheduler`)**: Step-by-step execution and Gantt visualization for `FCFS`, `SJF` (non-preemptive), `ROUND_ROBIN`, and `PRIORITY` scheduling.
- **Memory Manager (`/os/memory`)**: Contiguous partition allocation simulator supporting `FIRST_FIT`, `BEST_FIT`, and `WORST_FIT` with segment splitting and fragmentation tracking.
- **Paging & MMU (`/os/paging`)**: Page replacement (`FIFO`, `LRU`, `OPTIMAL`) and virtual-to-physical address translation with TLB and page table inspection.
- **Disk Scheduler (`/os/disk`)**: Track seek queue and head movement path simulator for `FCFS`, `SSTF`, `SCAN`, and `C-SCAN`.
- **Virtual File Manager (`/os/files`)**: Sandboxed database-backed virtual filesystem supporting directory tree navigation, virtual files, editing, renaming, and deletion.

### Database Systems
- **DBMS Explorer / Database Observatory (`/db/explorer`)**: Dynamic SQLAlchemy catalog discovery across schemas, user tables, SQL views, and optional system tables; server-side paginated/sortable/filtered records with exact vs. estimated count indicators; interactive 2D and 3D foreign-key topology visualization; validated CRUD operations with trace generation.
- **SQL Console (`/db/sql`)**: Guarded query runner blocking unsafe engine directives and attaching logical execution plans and trace steps.
- **Transactions (`/db/transactions`)**: Simulated ACID transaction lifecycle (`BEGIN`, `COMMIT`, `ROLLBACK`), lock inspection, and deadlock detection simulation.

### Analytics & Control
- **Algorithm Battle Lab (`/analytics/battle-lab`)**: Side-by-side comparison endpoints across CPU, Memory, and Disk scheduling algorithms with comparative metrics and trade-off analysis.
- **Event Logs (`/logs`) & System Monitor (`/monitor`)**: Filterable audit/event journal and aggregated workload telemetry.
- **Command Console (`/terminal`)**: Sandboxed Linux-inspired application terminal supporting virtual filesystem navigation (`pwd`, `ls`, `ls -la`, `cd`, `tree`, `cat`, `mkdir`, `touch`), parameterized database commands (`db.status`, `db.tables`, `db.views`, `db.describe`, `db.select`, `db.count`, `db.keys`, `db.relationships`), and subsystem commands (`avx.*`).

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Zustand, Recharts, Anime.js, Three.js (lazy-loaded WebGL views)
- **Backend**: Python, FastAPI, SQLAlchemy, Pydantic, Pytest
- **Database**: SQLite default (`sqlite:///./aegis.db`) or MySQL via `DATABASE_URL`

---

## Quick Start (Linux)

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r ../requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

See [backend/README.md](backend/README.md) for backend details and environment variables.

### 2. Frontend

```bash
npm install
npm run dev
```

The Vite development server connects to the FastAPI backend at `http://localhost:8000/api`.

---

## Verification Commands

### Backend Tests

```bash
cd backend
.venv/bin/pytest
```

### Frontend Typecheck, Build & Lint

```bash
npm run build
npm run lint
```
