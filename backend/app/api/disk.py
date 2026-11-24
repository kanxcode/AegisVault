from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import random

from app.database.connection import get_db
from app.models.simulation import DiskRequestModel, DiskSchedulingRun, SystemEvent, ExecutionModel
from app.schemas.disk import DiskSimulationRequest, DiskSimulationResult
from app.os_engine.disk.fcfs import schedule_fcfs
from app.os_engine.disk.sstf import schedule_sstf
from app.os_engine.disk.scan import schedule_scan
from app.os_engine.disk.cscan import schedule_cscan
from app.os_engine.trace_engine import TraceCollector
from pydantic import BaseModel, ConfigDict

router = APIRouter()

class DiskRequestCreate(BaseModel):
    track: int
    sector: Optional[int] = 1

class DiskRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    track: int
    sector: int
    status: str

@router.get("/requests", response_model=List[DiskRequestResponse])
def get_disk_requests(db: Session = Depends(get_db)):
    return db.query(DiskRequestModel).all()

@router.post("/requests", response_model=DiskRequestResponse)
def add_disk_request(req_in: DiskRequestCreate, db: Session = Depends(get_db)):
    req_id = f"d{random.randint(100, 999)}"
    new_req = DiskRequestModel(
        id=req_id,
        track=req_in.track,
        sector=req_in.sector or random.randint(1, 16),
        status="PENDING"
    )
    db.add(new_req)
    
    event = SystemEvent(
        module="DISK",
        event="IO_ENQUEUED",
        severity="INFO",
        description=f"Disk I/O request queued for track {new_req.track}, sector {new_req.sector}."
    )
    db.add(event)
    db.commit()
    db.refresh(new_req)
    return new_req

@router.delete("/requests/{req_id}")
def delete_disk_request(req_id: str, db: Session = Depends(get_db)):
    req = db.query(DiskRequestModel).filter(DiskRequestModel.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    db.delete(req)
    db.commit()
    return {"status": "ok"}

@router.post("/requests/clear-serviced")
def clear_serviced_requests(db: Session = Depends(get_db)):
    db.query(DiskRequestModel).filter(DiskRequestModel.status == "SERVICED").delete()
    db.commit()
    return {"status": "ok"}

@router.post("/simulate", response_model=DiskSimulationResult)
def simulate_disk(request: DiskSimulationRequest, db: Session = Depends(get_db)):
    if request.head < 0 or request.head >= request.disk_size:
        raise HTTPException(status_code=400, detail="Invalid initial head position")
        
    for r in request.requests:
        if r < 0 or r >= request.disk_size:
            raise HTTPException(status_code=400, detail=f"Invalid request track: {r}")
            
    algo = request.algorithm.upper()
    collector = TraceCollector(module="disk_scheduler")
    
    if algo == "FCFS":
        result = schedule_fcfs(request.head, request.requests, collector=collector)
    elif algo == "SSTF":
        result = schedule_sstf(request.head, request.requests, collector=collector)
    elif algo == "SCAN":
        if request.direction not in ["LEFT", "RIGHT"]:
            raise HTTPException(status_code=400, detail="Invalid direction")
        result = schedule_scan(request.head, request.requests, request.disk_size, request.direction, collector=collector)
    elif algo == "C-SCAN" or algo == "CSCAN":
        if request.direction not in ["LEFT", "RIGHT"]:
            raise HTTPException(status_code=400, detail="Invalid direction")
        result = schedule_cscan(request.head, request.requests, request.disk_size, request.direction, collector=collector)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported algorithm: {algo}")

    # Mark requests as SERVICED in database
    for t in request.requests:
        pending = db.query(DiskRequestModel).filter(
            DiskRequestModel.track == t,
            DiskRequestModel.status == "PENDING"
        ).first()
        if pending:
            pending.status = "SERVICED"

    # Persist run (legacy table)
    run_record = DiskSchedulingRun(
        algorithm=algo,
        total_head_movement=result.total_head_movement,
        average_seek_distance=result.average_seek_distance,
        service_order=result.service_order,
        movement_path=result.movement_path
    )
    db.add(run_record)

    # Persist in execution trace engine
    execution_record = ExecutionModel(
        id=collector.execution_id,
        module="disk_scheduler",
        algorithm=algo,
        status="COMPLETED",
        input_data={"algorithm": algo, "head": request.head, "requests": request.requests, "disk_size": request.disk_size, "direction": request.direction},
        result_data=result.model_dump(exclude={"trace_events"}),
        summary_metrics={
            "total_head_movement": result.total_head_movement,
            "average_seek_distance": result.average_seek_distance,
            "serviced_count": len(result.service_order)
        },
        trace_events=collector.get_events_dict(),
        total_steps=len(collector.get_events())
    )
    db.add(execution_record)

    event = SystemEvent(
        module="DISK",
        event="DISK_SCHEDULING_COMPLETED",
        severity="INFO",
        description=f"Simulated {algo}: total head movement {result.total_head_movement} tracks (Exec ID: {collector.execution_id})."
    )
    db.add(event)
    db.commit()

    return result

@router.get("/history")
def get_disk_history(limit: int = 10, db: Session = Depends(get_db)):
    runs = db.query(DiskSchedulingRun).order_by(DiskSchedulingRun.id.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "timestamp": r.timestamp.strftime("%H:%M:%S") if r.timestamp else "",
            "algorithm": r.algorithm,
            "total_head_movement": r.total_head_movement,
            "average_seek_distance": r.average_seek_distance,
            "service_order": r.service_order,
        }
        for r in runs
    ]
