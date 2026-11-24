from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.database.connection import get_db
from app.models.simulation import ProcessModel, SystemEvent, ExecutionModel
from app.schemas.process import ProcessCreate, ProcessStateUpdate, ProcessResponse
from app.os_engine.trace_engine import TraceCollector

router = APIRouter()

TRANSITION_CONDITIONS = {
    ("NEW", "READY"): ("Admission by OS Job Scheduler. Memory partition and Process Control Block (PCB) allocated.", "Admitted to Ready Queue"),
    ("READY", "RUNNING"): ("CPU Dispatcher selected process from front of Ready Queue. Process assigned to CPU core.", "Dispatched to CPU"),
    ("RUNNING", "WAITING"): ("Process initiated an I/O request or entered sleep state awaiting resource availability.", "Blocked on I/O"),
    ("WAITING", "READY"): ("I/O operation completed or interrupt received. Process restored to Ready Queue.", "I/O Finished / Ready"),
    ("RUNNING", "READY"): ("Time quantum expired or preempted by higher priority task. Moved to Ready Queue.", "Preempted / Quantum Expired"),
    ("RUNNING", "TERMINATED"): ("Process execution completed or received SIGKILL. Retained in zombie state until PCB cleanup.", "Process Terminated / Exit"),
    ("READY", "TERMINATED"): ("Process killed before dispatch.", "Aborted"),
    ("WAITING", "TERMINATED"): ("Waiting process received kill signal.", "Killed in Wait Queue"),
}

@router.get("/", response_model=List[ProcessResponse])
def get_processes(
    state: Optional[str] = Query(None, description="Filter by state (RUNNING, READY, WAITING, TERMINATED)"),
    search: Optional[str] = Query(None, description="Search by PID or process name"),
    db: Session = Depends(get_db)
):
    query = db.query(ProcessModel)
    if state and state.upper() != "ALL":
        query = query.filter(ProcessModel.state == state.upper())
    if search:
        s = f"%{search}%"
        query = query.filter((ProcessModel.pid.ilike(s)) | (ProcessModel.name.ilike(s)))
    
    return query.order_by(ProcessModel.id.asc()).all()

VALID_PROCESS_STATES = {"NEW", "READY", "RUNNING", "WAITING", "TERMINATED"}

@router.post("/", response_model=ProcessResponse)
def create_process(proc_in: ProcessCreate, db: Session = Depends(get_db)):
    pid_clean = proc_in.pid.strip().upper()
    name_clean = proc_in.name.strip()
    if not pid_clean or not name_clean:
        raise HTTPException(status_code=400, detail="Process PID and name must not be empty")

    target_state = proc_in.state.strip().upper()
    if target_state not in VALID_PROCESS_STATES:
        raise HTTPException(status_code=400, detail=f"Invalid initial process state: {target_state}")
    if proc_in.burst_time <= 0:
        raise HTTPException(status_code=400, detail="Burst time must be greater than zero")
    if proc_in.memory <= 0:
        raise HTTPException(status_code=400, detail="Memory allocation must be greater than zero")
    if proc_in.arrival_time < 0 or proc_in.cpu_time < 0:
        raise HTTPException(status_code=400, detail="Arrival time and CPU time must be non-negative")

    existing = db.query(ProcessModel).filter(ProcessModel.pid == pid_clean).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Process with PID {pid_clean} already exists")

    new_proc = ProcessModel(
        pid=pid_clean,
        name=name_clean,
        state=target_state,
        arrival_time=proc_in.arrival_time,
        burst_time=proc_in.burst_time,
        priority=proc_in.priority,
        cpu_time=proc_in.cpu_time,
        memory=proc_in.memory
    )
    db.add(new_proc)
    
    collector = TraceCollector(module="process_manager")
    collector.emit(
        simulation_time=0.0,
        operation="process_creation",
        entity=new_proc.pid,
        action="fork_and_allocate",
        reason=f"Created process {new_proc.pid} ({new_proc.name}) with {new_proc.burst_time}ms burst, {new_proc.memory}MB RAM.",
        explanation="OS allocated Process Control Block (PCB), assigned unique PID, registered resource limits, and placed in initial state.",
        calculation={
            "pid": new_proc.pid,
            "name": new_proc.name,
            "burst_time": new_proc.burst_time,
            "priority": new_proc.priority,
            "memory_mb": new_proc.memory,
            "initial_state": target_state
        },
        state_before={"pcb": "UNALLOCATED"},
        state_after={
            "pcb": {
                "pid": new_proc.pid,
                "state": target_state,
                "cpu_time": new_proc.cpu_time,
                "burst_time": new_proc.burst_time,
                "priority": new_proc.priority,
                "memory": new_proc.memory
            }
        },
        affected_entities=[new_proc.pid],
        next_step="Process ready for scheduler dispatch" if target_state == "READY" else "Waiting in initial state"
    )

    execution_record = ExecutionModel(
        id=collector.execution_id,
        module="process_manager",
        algorithm="PROCESS_LIFECYCLE",
        status="COMPLETED",
        input_data=proc_in.model_dump(),
        result_data={"pid": new_proc.pid, "state": target_state},
        summary_metrics={"pid": new_proc.pid, "burst_time": new_proc.burst_time},
        trace_events=collector.get_events_dict(),
        total_steps=1
    )
    db.add(execution_record)

    # Log event
    event = SystemEvent(
        module="PROC",
        event="PROCESS_CREATED",
        severity="INFO",
        description=f"Process {new_proc.pid} ({new_proc.name}) created in state {target_state} with {new_proc.burst_time}ms burst time (Exec ID: {collector.execution_id})."
    )
    db.add(event)
    db.commit()
    db.refresh(new_proc)

    resp = ProcessResponse.model_validate(new_proc)
    resp.last_transition_reason = f"Created in state {target_state}"
    resp.execution_id = collector.execution_id
    resp.trace_events = collector.get_events()
    return resp

@router.patch("/{pid}/state", response_model=ProcessResponse)
def update_process_state(pid: str, update: ProcessStateUpdate, db: Session = Depends(get_db)):
    proc = db.query(ProcessModel).filter(ProcessModel.pid == pid.upper()).first()
    if not proc:
        raise HTTPException(status_code=404, detail=f"Process {pid} not found")
        
    old_state = proc.state
    new_state = update.state.upper()
    if new_state not in ["NEW", "READY", "RUNNING", "WAITING", "TERMINATED"]:
        raise HTTPException(status_code=400, detail=f"Invalid state: {new_state}")

    proc.state = new_state
    old_cpu = proc.cpu_time
    if new_state == "RUNNING" and proc.cpu_time < proc.burst_time:
        proc.cpu_time = min(proc.burst_time, proc.cpu_time + 10)

    # Determine explanation based on state transition condition
    condition_desc, trigger_name = TRANSITION_CONDITIONS.get(
        (old_state, new_state), 
        (f"Manual transition from {old_state} to {new_state}", update.trigger or "Manual Override")
    )
    if update.reason:
        condition_desc += f" Reason: {update.reason}"

    collector = TraceCollector(module="process_manager")
    collector.emit(
        simulation_time=float(proc.cpu_time),
        operation="state_transition",
        entity=proc.pid,
        action=f"transition_{old_state}_to_{new_state}".lower(),
        reason=f"Transitioned {proc.pid} from {old_state} to {new_state}. Trigger: {trigger_name}.",
        explanation=condition_desc,
        calculation={
            "old_state": old_state,
            "new_state": new_state,
            "trigger": trigger_name,
            "cpu_time_before": old_cpu,
            "cpu_time_after": proc.cpu_time,
            "burst_time": proc.burst_time,
            "remaining_burst": max(0, proc.burst_time - proc.cpu_time)
        },
        state_before={"state": old_state, "cpu_time": old_cpu, "pcb_status": old_state},
        state_after={"state": new_state, "cpu_time": proc.cpu_time, "pcb_status": new_state},
        affected_entities=[proc.pid],
        next_step="Awaiting next scheduling or I/O event" if new_state != "TERMINATED" else "PCB ready to be reaped"
    )

    execution_record = ExecutionModel(
        id=collector.execution_id,
        module="process_manager",
        algorithm="STATE_TRANSITION",
        status="COMPLETED",
        input_data={"pid": pid, "target_state": new_state, "trigger": trigger_name},
        result_data={"pid": pid, "state": new_state, "cpu_time": proc.cpu_time},
        summary_metrics={"old_state": old_state, "new_state": new_state},
        trace_events=collector.get_events_dict(),
        total_steps=1
    )
    db.add(execution_record)

    event = SystemEvent(
        module="PROC",
        event="STATE_TRANSITION",
        severity="INFO",
        description=f"{proc.pid} transitioned {old_state} -> {new_state} ({trigger_name})."
    )
    db.add(event)
    db.commit()
    db.refresh(proc)

    resp = ProcessResponse.model_validate(proc)
    resp.last_transition_reason = condition_desc
    resp.execution_id = collector.execution_id
    resp.trace_events = collector.get_events()
    return resp

@router.delete("/{pid}")
def delete_process(pid: str, db: Session = Depends(get_db)):
    proc = db.query(ProcessModel).filter(ProcessModel.pid == pid.upper()).first()
    if not proc:
        raise HTTPException(status_code=404, detail=f"Process {pid} not found")
        
    db.delete(proc)
    event = SystemEvent(
        module="PROC",
        event="PROCESS_TERMINATED",
        severity="WARNING",
        description=f"Process {pid} killed and purged from table."
    )
    db.add(event)
    db.commit()
    return {"status": "ok", "message": f"Process {pid} removed"}

@router.post("/reset", response_model=List[ProcessResponse])
def reset_processes(db: Session = Depends(get_db)):
    db.query(ProcessModel).delete()
    db.commit()
    from app.database.seed import seed_database
    seed_database(db)
    return db.query(ProcessModel).all()
