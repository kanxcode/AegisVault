from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

from app.database.connection import get_db
from app.models.simulation import ExecutionModel
from app.schemas.trace import ExecutionRecordResponse, ExecutionHistoryItem, TraceEvent
from app.schemas.scheduling import ProcessInput, SchedulingResult
from app.schemas.memory import MemoryBlockInput, ProcessMemoryRequest, MemorySimulationResult
from app.schemas.disk import DiskSimulationResult
from app.os_engine.scheduling.fcfs import schedule_fcfs
from app.os_engine.scheduling.sjf import schedule_sjf
from app.os_engine.scheduling.round_robin import schedule_round_robin
from app.os_engine.scheduling.priority import schedule_priority
from app.os_engine.memory.first_fit import allocate_first_fit
from app.os_engine.memory.best_fit import allocate_best_fit
from app.os_engine.memory.worst_fit import allocate_worst_fit
from app.os_engine.disk.fcfs import schedule_fcfs as disk_fcfs
from app.os_engine.disk.sstf import schedule_sstf as disk_sstf
from app.os_engine.disk.scan import schedule_scan as disk_scan
from app.os_engine.disk.cscan import schedule_cscan as disk_cscan
from app.os_engine.trace_engine import TraceCollector

router = APIRouter()

class CpuCompareRequest(BaseModel):
    processes: List[ProcessInput]
    quantum: Optional[int] = 4

class MemoryCompareRequest(BaseModel):
    blocks: List[MemoryBlockInput]
    processes: List[ProcessMemoryRequest]

class DiskCompareRequest(BaseModel):
    head: int
    requests: List[int]
    disk_size: int = 200
    direction: str = "RIGHT"

@router.get("/history", response_model=List[ExecutionHistoryItem])
def get_execution_history(
    module: Optional[str] = Query(None, description="Filter by module"),
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db)
):
    q = db.query(ExecutionModel)
    if module and module.upper() != "ALL":
        q = q.filter(ExecutionModel.module.ilike(module))
    runs = q.order_by(ExecutionModel.created_at.desc()).limit(limit).all()
    
    return [
        ExecutionHistoryItem(
            execution_id=r.id,
            module=r.module,
            algorithm=r.algorithm,
            status=r.status,
            total_steps=r.total_steps,
            created_at=r.created_at.strftime("%Y-%m-%d %H:%M:%S") if r.created_at else "",
            summary_metrics=r.summary_metrics or {}
        )
        for r in runs
    ]

@router.get("/{execution_id}", response_model=ExecutionRecordResponse)
def get_execution_detail(execution_id: str, db: Session = Depends(get_db)):
    record = db.query(ExecutionModel).filter(ExecutionModel.id == execution_id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"Execution '{execution_id}' not found")
        
    events = [TraceEvent(**e) for e in (record.trace_events or [])]
    last_time = events[-1].simulation_time if events else 0.0
    
    return ExecutionRecordResponse(
        execution_id=record.id,
        module=record.module,
        algorithm=record.algorithm,
        status=record.status,
        total_steps=record.total_steps,
        final_simulation_time=last_time,
        input_params=record.input_data or {},
        summary_metrics=record.summary_metrics or {},
        trace_events=events,
        created_at=record.created_at.strftime("%Y-%m-%d %H:%M:%S") if record.created_at else ""
    )

@router.get("/{execution_id}/trace", response_model=List[TraceEvent])
def get_execution_trace(
    execution_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(500, le=1000),
    db: Session = Depends(get_db)
):
    record = db.query(ExecutionModel).filter(ExecutionModel.id == execution_id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"Execution '{execution_id}' not found")
        
    raw_events = record.trace_events or []
    sliced = raw_events[offset:offset + limit]
    return [TraceEvent(**e) for e in sliced]

@router.get("/{execution_id}/trace/{step_number}", response_model=TraceEvent)
def get_execution_trace_step(execution_id: str, step_number: int, db: Session = Depends(get_db)):
    record = db.query(ExecutionModel).filter(ExecutionModel.id == execution_id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"Execution '{execution_id}' not found")
        
    for e in (record.trace_events or []):
        if e.get("step_number") == step_number:
            return TraceEvent(**e)
            
    raise HTTPException(status_code=404, detail=f"Step {step_number} not found in execution {execution_id}")

# --- DECISION COMPARISON ENDPOINTS ---

@router.post("/compare/cpu")
def compare_cpu_algorithms(req: CpuCompareRequest):
    if not req.processes:
        raise HTTPException(status_code=400, detail="Process list cannot be empty")
        
    results = {}
    algos = ["FCFS", "SJF", "ROUND_ROBIN", "PRIORITY"]
    
    for algo in algos:
        c = TraceCollector(module="cpu_scheduler")
        if algo == "FCFS":
            res = schedule_fcfs(req.processes, collector=c)
        elif algo == "SJF":
            res = schedule_sjf(req.processes, collector=c)
        elif algo == "ROUND_ROBIN":
            res = schedule_round_robin(req.processes, quantum=req.quantum or 4, collector=c)
        else:
            res = schedule_priority(req.processes, collector=c)
        results[algo] = res

    # Comparison metrics table
    comparison_table = [
        {
            "algorithm": a,
            "average_waiting_time": round(results[a].average_waiting_time, 2),
            "average_turnaround_time": round(results[a].average_turnaround_time, 2),
            "average_response_time": round(results[a].average_response_time, 2),
            "cpu_utilization": round(results[a].cpu_utilization, 1),
            "execution_order": results[a].execution_order,
            "makespan": results[a].gantt[-1].end if results[a].gantt else 0,
            "context_switches": max(0, len(results[a].gantt) - 1)
        }
        for a in algos
    ]

    # Best rankings
    best_waiting = min(comparison_table, key=lambda x: x["average_waiting_time"])
    best_response = min(comparison_table, key=lambda x: x["average_response_time"])
    
    tradeoffs = (
        f"For this workload, {best_waiting['algorithm']} yielded the lowest average waiting time "
        f"({best_waiting['average_waiting_time']} ms). Shortest Job First is mathematically optimal for minimizing average waiting time "
        f"when burst durations are known beforehand. Round Robin (q={req.quantum}ms) provides interactive responsiveness "
        f"({results['ROUND_ROBIN'].average_response_time:.2f} ms avg response) but incurs {max(0, len(results['ROUND_ROBIN'].gantt) - 1)} context switches. "
        "No single algorithm is universally superior across all workloads."
    )

    return {
        "module": "CPU_SCHEDULING",
        "comparison_table": comparison_table,
        "best_waiting_algorithm": best_waiting["algorithm"],
        "best_response_algorithm": best_response["algorithm"],
        "tradeoff_analysis": tradeoffs,
        "results": {a: results[a].model_dump() for a in algos}
    }

@router.post("/compare/memory")
def compare_memory_algorithms(req: MemoryCompareRequest):
    if not req.blocks or not req.processes:
        raise HTTPException(status_code=400, detail="Blocks and processes must not be empty")

    results = {}
    algos = ["FIRST_FIT", "BEST_FIT", "WORST_FIT"]
    
    for algo in algos:
        c = TraceCollector(module="memory_manager")
        if algo == "FIRST_FIT":
            res = allocate_first_fit(req.blocks, req.processes, collector=c)
        elif algo == "BEST_FIT":
            res = allocate_best_fit(req.blocks, req.processes, collector=c)
        else:
            res = allocate_worst_fit(req.blocks, req.processes, collector=c)
        results[algo] = res

    comparison_table = [
        {
            "algorithm": a,
            "allocated_memory": results[a].allocated_memory,
            "free_memory": results[a].free_memory,
            "fragmentation": results[a].fragmentation,
            "successful_allocations": len(results[a].allocations),
            "unallocated_count": len(results[a].unallocated_processes),
            "unallocated_pids": results[a].unallocated_processes,
            "remaining_blocks_count": len(results[a].remaining_blocks)
        }
        for a in algos
    ]

    tradeoffs = (
        "First Fit minimizes block search time by choosing the first qualifying hole. "
        "Best Fit searches the entire memory map to minimize leftover partition space, but often produces tiny unusable fragments. "
        "Worst Fit allocates the largest partition to keep remaining free chunks as large and usable as possible."
    )

    return {
        "module": "MEMORY_ALLOCATION",
        "comparison_table": comparison_table,
        "tradeoff_analysis": tradeoffs,
        "results": {a: results[a].model_dump() for a in algos}
    }

@router.post("/compare/disk")
def compare_disk_algorithms(req: DiskCompareRequest):
    if not req.requests:
        raise HTTPException(status_code=400, detail="Disk requests cannot be empty")

    results = {}
    algos = ["FCFS", "SSTF", "SCAN", "C-SCAN"]
    
    for algo in algos:
        c = TraceCollector(module="disk_scheduler")
        if algo == "FCFS":
            res = disk_fcfs(req.head, req.requests, collector=c)
        elif algo == "SSTF":
            res = disk_sstf(req.head, req.requests, collector=c)
        elif algo == "SCAN":
            res = disk_scan(req.head, req.requests, req.disk_size, req.direction, collector=c)
        else:
            res = disk_cscan(req.head, req.requests, req.disk_size, req.direction, collector=c)
        results[algo] = res

    comparison_table = [
        {
            "algorithm": a,
            "total_head_movement": results[a].total_head_movement,
            "average_seek_distance": round(results[a].average_seek_distance, 2),
            "service_order": results[a].service_order,
            "head_path_length": len(results[a].movement_path)
        }
        for a in algos
    ]

    best_movement = min(comparison_table, key=lambda x: x["total_head_movement"])

    tradeoffs = (
        f"For this track workload, {best_movement['algorithm']} produced the lowest total cylinder seek distance "
        f"({best_movement['total_head_movement']} tracks). SSTF minimizes seek distance locally but risks starvation for tracks far from the head. "
        "SCAN guarantees progress across all cylinders and eliminates starvation. "
        "C-SCAN provides uniform waiting time by resetting to the start cylinder without servicing on the return pass."
    )

    return {
        "module": "DISK_SCHEDULING",
        "comparison_table": comparison_table,
        "best_movement_algorithm": best_movement["algorithm"],
        "tradeoff_analysis": tradeoffs,
        "results": {a: results[a].model_dump() for a in algos}
    }
