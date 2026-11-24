from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from app.database.connection import get_db
from app.models.simulation import SystemEvent, ExecutionModel
from app.schemas.paging import (
    PagingSimulateRequest, PagingSimulateResponse,
    AddressTranslateRequest, AddressTranslateResponse
)
from app.os_engine.paging.fifo import simulate_fifo
from app.os_engine.paging.lru import simulate_lru
from app.os_engine.paging.optimal import simulate_optimal
from app.os_engine.paging.translator import translate_address
from app.os_engine.trace_engine import TraceCollector

router = APIRouter()

# Process page tables cache
PROCESS_PAGE_TABLES: Dict[str, List[Dict[str, Any]]] = {
    "P101": [
        {"page": 0, "frame": 0, "valid": True, "modified": False},
        {"page": 1, "frame": 2, "valid": True, "modified": True},
        {"page": 2, "frame": 4, "valid": True, "modified": False},
        {"page": 3, "frame": None, "valid": False, "modified": False},
        {"page": 4, "frame": 6, "valid": True, "modified": True},
        {"page": 5, "frame": None, "valid": False, "modified": False},
        {"page": 6, "frame": 8, "valid": True, "modified": False},
    ],
    "P102": [
        {"page": 0, "frame": 1, "valid": True, "modified": False},
        {"page": 1, "frame": 3, "valid": True, "modified": False},
        {"page": 2, "frame": None, "valid": False, "modified": False},
        {"page": 3, "frame": 5, "valid": True, "modified": True},
    ],
    "P103": [
        {"page": 0, "frame": 7, "valid": True, "modified": True},
        {"page": 1, "frame": 9, "valid": True, "modified": False},
        {"page": 2, "frame": 11, "valid": True, "modified": False},
        {"page": 3, "frame": 13, "valid": True, "modified": True},
        {"page": 4, "frame": None, "valid": False, "modified": False},
    ]
}

PROCESS_TLB: Dict[str, List[Dict[str, Any]]] = {
    "P101": [
        {"tag": "01", "page": 0, "frame": 0},
        {"tag": "02", "page": 2, "frame": 4},
        {"tag": "03", "page": 4, "frame": 6},
    ],
    "P102": [
        {"tag": "01", "page": 0, "frame": 1},
        {"tag": "02", "page": 1, "frame": 3},
    ],
    "P103": [
        {"tag": "01", "page": 0, "frame": 7},
        {"tag": "02", "page": 1, "frame": 9},
    ]
}

@router.get("/process/{pid}")
def get_process_paging_info(pid: str):
    pid_clean = pid.upper()
    pt = PROCESS_PAGE_TABLES.get(pid_clean, PROCESS_PAGE_TABLES["P101"])
    tlb = PROCESS_TLB.get(pid_clean, PROCESS_TLB["P101"])
    
    valid_count = sum(1 for p in pt if p["valid"])
    total_count = len(pt)
    
    return {
        "pid": pid_clean,
        "page_table": pt,
        "tlb": tlb,
        "total_pages": total_count,
        "resident_pages": valid_count,
        "hit_rate": 94.2 if pid_clean == "P101" else (88.5 if pid_clean == "P102" else 91.0),
        "miss_rate": 5.8 if pid_clean == "P101" else (11.5 if pid_clean == "P102" else 9.0)
    }

@router.post("/simulate", response_model=PagingSimulateResponse)
def simulate_paging(req: PagingSimulateRequest, db: Session = Depends(get_db)):
    if req.frame_count <= 0:
        raise HTTPException(status_code=400, detail="Frame count must be greater than zero")
    if not req.reference_string:
        raise HTTPException(status_code=400, detail="Reference string cannot be empty")

    algo = req.algorithm.upper()
    collector = TraceCollector(module="paging_replacement")
    
    if algo == "FIFO":
        result = simulate_fifo(req.reference_string, req.frame_count, collector=collector)
    elif algo == "LRU":
        result = simulate_lru(req.reference_string, req.frame_count, collector=collector)
    elif algo == "OPTIMAL" or algo == "OPT":
        result = simulate_optimal(req.reference_string, req.frame_count, collector=collector)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported paging algorithm: {algo}")

    # Persist in execution trace engine
    execution_record = ExecutionModel(
        id=collector.execution_id,
        module="paging_replacement",
        algorithm=algo,
        status="COMPLETED",
        input_data={"algorithm": algo, "frame_count": req.frame_count, "reference_string": req.reference_string},
        result_data={k: v for k, v in result.items() if k != "trace_events"},
        summary_metrics={
            "page_faults": result["page_faults"],
            "hits": result["hits"],
            "fault_rate": result["fault_rate"],
            "hit_rate": result["hit_rate"]
        },
        trace_events=collector.get_events_dict(),
        total_steps=len(collector.get_events())
    )
    db.add(execution_record)

    # Log event
    event = SystemEvent(
        module="MEM",
        event="PAGE_REPLACEMENT_SIM",
        severity="INFO",
        description=f"Simulated {algo} paging: {result['page_faults']} faults, {result['fault_rate']}% fault rate (Exec ID: {collector.execution_id})."
    )
    db.add(event)
    db.commit()

    return result

@router.post("/translate", response_model=AddressTranslateResponse)
def translate_virtual_address(req: AddressTranslateRequest, db: Session = Depends(get_db)):
    pid = (req.pid or "P101").upper()
    pt = PROCESS_PAGE_TABLES.get(pid, PROCESS_PAGE_TABLES["P101"])
    tlb = PROCESS_TLB.get(pid, PROCESS_TLB["P101"])
    collector = TraceCollector(module="paging_translation")
    
    result = translate_address(
        virtual_address_hex=req.virtual_address,
        page_size=req.page_size,
        tlb_entries=tlb,
        page_table=pt,
        collector=collector
    )

    # Persist in execution trace engine
    execution_record = ExecutionModel(
        id=collector.execution_id,
        module="paging_translation",
        algorithm="MMU_LOOKUP",
        status="COMPLETED",
        input_data={"virtual_address": req.virtual_address, "page_size": req.page_size, "pid": pid},
        result_data={k: v for k, v in result.items() if k != "trace_events"},
        summary_metrics={
            "physical_address": result["physical_address"],
            "tlb_hit": result["tlb_hit"],
            "page_fault": result["page_fault"],
            "latency_ns": result["latency_ns"]
        },
        trace_events=collector.get_events_dict(),
        total_steps=len(collector.get_events())
    )
    db.add(execution_record)
    db.commit()

    return result
