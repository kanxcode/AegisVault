from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import random
import time

from app.database.connection import get_db
from app.models.simulation import (
    ProcessModel, MemoryBlockModel, DiskRequestModel,
    TransactionModel, SystemEvent
)

router = APIRouter()
_SERVER_START_MONOTONIC = time.monotonic()

@router.get("/metrics")
def get_system_metrics(db: Session = Depends(get_db)):
    # Calculate CPU utilization
    running_procs = db.query(ProcessModel).filter(ProcessModel.state == "RUNNING").count()
    ready_procs = db.query(ProcessModel).filter(ProcessModel.state == "READY").count()
    total_active_procs = db.query(ProcessModel).filter(ProcessModel.state != "TERMINATED").count()
    
    # Baseline load plus load from running/ready processes
    cpu_util = min(98.5, max(12.0, 20.0 + (running_procs * 18.5) + (ready_procs * 4.2) + random.uniform(-1.5, 2.5)))

    # Calculate Memory utilization
    blocks = db.query(MemoryBlockModel).all()
    total_mem = sum(b.size for b in blocks) if blocks else 4096
    used_mem = sum(b.size for b in blocks if b.status == "ALLOCATED") if blocks else 2560
    mem_util = round((used_mem / total_mem * 100), 1) if total_mem > 0 else 55.0

    # Pending disk requests
    pending_disk = db.query(DiskRequestModel).filter(DiskRequestModel.status == "PENDING").count()

    # Active DB transactions
    active_tx = db.query(TransactionModel).filter(TransactionModel.status == "ACTIVE").count()

    # Telemetry history for charts (last 5 intervals)
    now = datetime.utcnow()
    telemetry = []
    for i in range(5, 0, -1):
        t_time = (now - timedelta(minutes=i)).strftime("%H:%M")
        noise = (i % 2) * 5.0
        telemetry.append({
            "time": t_time,
            "cpu": round(max(15.0, cpu_util - (i * 3.5) + noise), 1),
            "memory": round(max(40.0, mem_util - (i * 1.2)), 1),
            "temp": round(45 + (cpu_util * 0.18), 1),
            "network": int(180 + (active_tx * 120) + (i * 45))
        })
    # Current point
    telemetry.append({
        "time": now.strftime("%H:%M"),
        "cpu": round(cpu_util, 1),
        "memory": round(mem_util, 1),
        "temp": round(46 + (cpu_util * 0.18), 1),
        "network": int(220 + (active_tx * 150))
    })

    return {
        "cpu_utilization": round(cpu_util, 1),
        "memory_utilization": round(mem_util, 1),
        "active_processes": total_active_procs,
        "disk_queue": pending_disk,
        "active_transactions": active_tx,
        "temperature": round(46 + (cpu_util * 0.18), 1),
        "network_throughput_kb": int(220 + (active_tx * 150)),
        "uptime_seconds": round(time.monotonic() - _SERVER_START_MONOTONIC, 1),
        "telemetry": telemetry
    }
