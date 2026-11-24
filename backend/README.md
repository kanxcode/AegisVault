# AegisVault Backend

This is the Python backend foundation for the AegisVault OS and DBMS prototype.

**IMPORTANT**: These are application-level simulations and do not modify the host operating system kernel or physical resources.

## Architecture

The backend is built with:
- **FastAPI**: REST API framework.
- **SQLAlchemy**: ORM for MySQL integration.
- **Pytest**: For testing OS algorithms independently of the API.
- **Pydantic**: For strict data validation.

The system is separated into:
- `app/api`: FastAPI routes.
- `app/os_engine`: Pure algorithmic simulations (CPU, Memory, Disk).
- `app/models`: Database schema models.
- `app/schemas`: Pydantic input/output schemas.

## Setup (Linux)

1. Navigate to the backend directory and create a virtual environment:
   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the development server:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

   Or without activating the virtual environment:
   ```bash
   cd backend && .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

## Environment Variables

- `DATABASE_URL`: Connection string for the database (defaults to SQLite `sqlite:///./aegis.db` for local dev without MySQL setup).
For MySQL: `mysql+pymysql://user:pass@localhost:3306/aegis`

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/scheduling/run` - Execute a CPU scheduling algorithm
- `POST /api/events/` - Add a system event
- `GET /api/events/` - Get system events

### Example Request

```json
POST /api/scheduling/run
{
    "algorithm": "RR",
    "quantum": 4,
    "processes": [
        {
            "pid": "P101",
            "arrival_time": 0,
            "burst_time": 8,
            "priority": 1
        }
    ]
}
```

## OS Algorithms Implemented
- CPU Scheduling: FCFS, SJF (Non-preemptive), Round Robin, Priority (Non-preemptive, lower number = higher priority).

## Testing Commands

Run the test suite using pytest:
```bash
pytest
```
