from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from app.database.connection import get_db
from app.models.simulation import MemoryBlockModel, MemoryAllocationRun, SystemEvent, ExecutionModel
from app.schemas.memory import MemorySimulationRequest, MemorySimulationResult
from app.os_engine.memory.first_fit import allocate_first_fit
from app.os_engine.memory.best_fit import allocate_best_fit
from app.os_engine.memory.worst_fit import allocate_worst_fit
from app.os_engine.trace_engine import TraceCollector

router = APIRouter()

class BlockResponse(BaseModel):
    id: str
    startAddress: str
    size: int
    status: str
    processId: Optional[str] = None

class BlockCreate(BaseModel):
    id: str
    size: int
    startAddress: Optional[str] = None

@router.get("/blocks", response_model=List[BlockResponse])
def get_memory_blocks(db: Session = Depends(get_db)):
    blocks = db.query(MemoryBlockModel).all()
    return [
        BlockResponse(
            id=b.id,
            startAddress=b.start_address,
            size=b.size,
            status=b.status,
            processId=b.process_id
        )
        for b in blocks
    ]

@router.post("/blocks/reset", response_model=List[BlockResponse])
def reset_memory_blocks(db: Session = Depends(get_db)):
    db.query(MemoryBlockModel).delete()
    db.commit()
    from app.database.seed import seed_database
    seed_database(db)
    return get_memory_blocks(db)

@router.post("/simulate", response_model=MemorySimulationResult)
def simulate_memory(request: MemorySimulationRequest, db: Session = Depends(get_db)):
    if not request.blocks:
        raise HTTPException(status_code=400, detail="Memory blocks cannot be empty")
        
    for b in request.blocks:
        if b.size <= 0:
            raise HTTPException(status_code=400, detail=f"Block {b.id} has invalid size")
            
    for p in request.processes:
        if p.size <= 0:
            raise HTTPException(status_code=400, detail=f"Process {p.pid} has invalid size")
            
    algo = request.algorithm.upper()
    collector = TraceCollector(module="memory_manager")
    
    if algo in ["FIRST_FIT", "FIRST FIT"]:
        result = allocate_first_fit(request.blocks, request.processes, collector=collector)
    elif algo in ["BEST_FIT", "BEST FIT"]:
        result = allocate_best_fit(request.blocks, request.processes, collector=collector)
    elif algo in ["WORST_FIT", "WORST FIT"]:
        result = allocate_worst_fit(request.blocks, request.processes, collector=collector)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported algorithm: {algo}")

    # Persist run (legacy table)
    run_record = MemoryAllocationRun(
        algorithm=algo,
        allocated_memory=result.allocated_memory,
        free_memory=result.free_memory,
        fragmentation=result.fragmentation,
        allocations=[a.model_dump() for a in result.allocations],
        unallocated_processes=result.unallocated_processes
    )
    db.add(run_record)

    # Persist in execution trace engine
    execution_record = ExecutionModel(
        id=collector.execution_id,
        module="memory_manager",
        algorithm=algo,
        status="COMPLETED",
        input_data={"algorithm": algo, "blocks": [b.model_dump() for b in request.blocks], "processes": [p.model_dump() for p in request.processes]},
        result_data=result.model_dump(exclude={"trace_events"}),
        summary_metrics={
            "allocated_memory": result.allocated_memory,
            "free_memory": result.free_memory,
            "fragmentation": result.fragmentation,
            "allocations_count": len(result.allocations),
            "unallocated_count": len(result.unallocated_processes)
        },
        trace_events=collector.get_events_dict(),
        total_steps=len(collector.get_events())
    )
    db.add(execution_record)

    # Update blocks in DB with allocated process IDs
    alloc_map = {a.block_id: a.pid for a in result.allocations}
    for rb in result.remaining_blocks:
        db_block = db.query(MemoryBlockModel).filter(MemoryBlockModel.id == rb.id).first()
        if db_block:
            db_block.status = rb.status
            db_block.process_id = alloc_map.get(rb.id)

    event = SystemEvent(
        module="MEM",
        event="MEMORY_ALLOCATION_COMPLETED",
        severity="INFO",
        description=f"Allocated memory with {algo}: {result.allocated_memory}MB allocated, {result.fragmentation}MB fragmentation (Exec ID: {collector.execution_id})."
    )
    db.add(event)
    db.commit()

    return result

@router.get("/history")
def get_memory_history(limit: int = 10, db: Session = Depends(get_db)):
    runs = db.query(MemoryAllocationRun).order_by(MemoryAllocationRun.id.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "timestamp": r.timestamp.strftime("%H:%M:%S") if r.timestamp else "",
            "algorithm": r.algorithm,
            "allocated_memory": r.allocated_memory,
            "free_memory": r.free_memory,
            "fragmentation": r.fragmentation,
            "allocations_count": len(r.allocations) if r.allocations else 0,
            "unallocated_count": len(r.unallocated_processes) if r.unallocated_processes else 0,
        }
        for r in runs
    ]
