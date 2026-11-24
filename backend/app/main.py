from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import scheduling, events, memory, disk, processes, paging, files, dbms, transactions, system, executions
from app.models.base import Base
from app.database.connection import engine, SessionLocal
from app.database.seed import seed_database

from sqlalchemy import text, inspect

# Initialize database tables
Base.metadata.create_all(bind=engine)

# Auto-migrate missing columns for SQLite if upgrading existing database
try:
    with engine.connect() as conn:
        inspector = inspect(conn)
        if "system_events" in inspector.get_table_names():
            cols = [c["name"] for c in inspector.get_columns("system_events")]
            if "execution_id" not in cols:
                conn.execute(text("ALTER TABLE system_events ADD COLUMN execution_id VARCHAR(64)"))
            if "step_number" not in cols:
                conn.execute(text("ALTER TABLE system_events ADD COLUMN step_number INTEGER"))
            if "status" not in cols:
                conn.execute(text("ALTER TABLE system_events ADD COLUMN status VARCHAR(20) DEFAULT 'SUCCESS'"))
            if "entity" not in cols:
                conn.execute(text("ALTER TABLE system_events ADD COLUMN entity VARCHAR(100)"))
            conn.commit()
except Exception:
    pass

# Seed database with initial covert-ops state if empty
with SessionLocal() as db_session:
    seed_database(db_session)

app = FastAPI(
    title="AegisVault OS Simulation API",
    description="Backend foundation for AegisVault OS and DBMS prototype.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(executions.router, prefix="/api/executions", tags=["Executions & Trace"])
app.include_router(scheduling.router, prefix="/api/scheduling", tags=["Scheduling"])
app.include_router(events.router, prefix="/api/events", tags=["Events"])
app.include_router(memory.router, prefix="/api/memory", tags=["Memory"])
app.include_router(disk.router, prefix="/api/disk", tags=["Disk"])
app.include_router(processes.router, prefix="/api/processes", tags=["Processes"])
app.include_router(paging.router, prefix="/api/paging", tags=["Paging"])
app.include_router(files.router, prefix="/api/files", tags=["Virtual Files"])
app.include_router(dbms.router, prefix="/api/db", tags=["DBMS Explorer & SQL"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["Transactions"])
app.include_router(system.router, prefix="/api/system", tags=["System Telemetry"])

@app.get("/api/health", tags=["Health"])
def health_check():
    return {"status": "ok", "message": "AegisVault API is operational"}
