from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class PagingSimulateRequest(BaseModel):
    algorithm: str = "FIFO" # FIFO, LRU, OPTIMAL
    frame_count: int = 3
    reference_string: List[int]

class PagingStep(BaseModel):
    page: int
    frames: List[Optional[int]]
    hit: bool
    victim: Optional[int]

from app.schemas.trace import TraceEvent

class PagingSimulateResponse(BaseModel):
    algorithm: str
    frame_count: int
    total_references: int
    page_faults: int
    hits: int
    fault_rate: float
    hit_rate: float
    steps: List[PagingStep]
    execution_id: Optional[str] = None
    trace_events: List[TraceEvent] = []

class AddressTranslateRequest(BaseModel):
    virtual_address: str # hex like "0x1A4C" or "0x002A"
    page_size: int = 4096
    pid: Optional[str] = "P101"

class AddressTranslateResponse(BaseModel):
    virtual_address: str
    virtual_decimal: int
    page_size: int
    page_number: int
    page_hex: str
    offset: int
    offset_hex: str
    tlb_hit: bool
    page_fault: bool
    frame_number: int
    frame_hex: str
    physical_address: str
    physical_decimal: int
    latency_ns: int
    lookup_trace: str
    execution_id: Optional[str] = None
    trace_events: List[TraceEvent] = []
