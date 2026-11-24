from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models.simulation import SchedulingRun, SystemEvent, ExecutionModel
from app.schemas.scheduling import SchedulingRequest, SchedulingResult
from app.os_engine.scheduling.fcfs import schedule_fcfs
from app.os_engine.scheduling.sjf import schedule_sjf
from app.os_engine.scheduling.round_robin import schedule_round_robin
from app.os_engine.scheduling.priority import schedule_priority
from app.os_engine.trace_engine import TraceCollector

router = APIRouter()

@router.post("/run", response_model=SchedulingResult)
def run_scheduler(request: SchedulingRequest, db: Session = Depends(get_db)):
    if not request.processes:
        raise HTTPException(status_code=400, detail="Process list cannot be empty")
        
    for p in request.processes:
        if p.burst_time <= 0:
            raise HTTPException(status_code=400, detail=f"Process {p.pid} has invalid burst time")
        if p.arrival_time < 0:
            raise HTTPException(status_code=400, detail=f"Process {p.pid} has negative arrival time")
            
    algo = request.algorithm.upper()
    collector = TraceCollector(module="cpu_scheduler")
    
    if algo == "FCFS":
        result = schedule_fcfs(request.processes, collector=collector)
    elif algo == "SJF":
        result = schedule_sjf(request.processes, collector=collector)
    elif algo in ["ROUND_ROBIN", "RR"]:
        if not request.quantum or request.quantum <= 0:
            raise HTTPException(status_code=400, detail="Round Robin requires a positive time quantum")
        result = schedule_round_robin(request.processes, request.quantum, collector=collector)
    elif algo == "PRIORITY":
        result = schedule_priority(request.processes, collector=collector)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported algorithm: {algo}")

    # Persist simulation run (legacy table)
    run_record = SchedulingRun(
        algorithm=algo,
        quantum=request.quantum,
        cpu_utilization=result.cpu_utilization,
        average_waiting_time=result.average_waiting_time,
        average_turnaround_time=result.average_turnaround_time,
        average_response_time=result.average_response_time,
        gantt_data=[g.model_dump() for g in result.gantt],
        process_data=[p.model_dump() for p in request.processes]
    )
    db.add(run_record)

    # Persist in execution trace engine
    execution_record = ExecutionModel(
        id=collector.execution_id,
        module="cpu_scheduler",
        algorithm=algo,
        status="COMPLETED",
        input_data={"algorithm": algo, "quantum": request.quantum, "processes": [p.model_dump() for p in request.processes]},
        result_data=result.model_dump(exclude={"trace_events"}),
        summary_metrics={
            "cpu_utilization": result.cpu_utilization,
            "average_waiting_time": result.average_waiting_time,
            "average_turnaround_time": result.average_turnaround_time,
            "average_response_time": result.average_response_time
        },
        trace_events=collector.get_events_dict(),
        total_steps=len(collector.get_events())
    )
    db.add(execution_record)

    event = SystemEvent(
        module="CPU",
        event="SCHEDULER_EXEC",
        severity="INFO",
        description=f"Executed {algo} scheduling: avg wait {result.average_waiting_time:.2f}ms, CPU util {result.cpu_utilization:.1f}% (Exec ID: {collector.execution_id})."
    )
    db.add(event)
    db.commit()

    return result

@router.get("/history")
def get_scheduling_history(limit: int = 10, db: Session = Depends(get_db)):
    runs = db.query(SchedulingRun).order_by(SchedulingRun.id.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "timestamp": r.timestamp.strftime("%H:%M:%S") if r.timestamp else "",
            "algorithm": r.algorithm,
            "quantum": r.quantum,
            "cpu_utilization": r.cpu_utilization,
            "average_waiting_time": r.average_waiting_time,
            "average_turnaround_time": r.average_turnaround_time,
            "average_response_time": r.average_response_time,
        }
        for r in runs
    ]
