from pydantic import BaseModel
from typing import List, Optional

class MemoryBlockInput(BaseModel):
    id: str
    size: int
    status: str = "FREE"  # FREE or ALLOCATED

class ProcessMemoryRequest(BaseModel):
    pid: str
    size: int

class MemorySimulationRequest(BaseModel):
    algorithm: str
    blocks: List[MemoryBlockInput]
    processes: List[ProcessMemoryRequest]

class AllocationResult(BaseModel):
    block_id: str
    pid: str
    allocated_size: int

from app.schemas.trace import TraceEvent

class MemorySimulationResult(BaseModel):
    algorithm: str
    allocations: List[AllocationResult]
    remaining_blocks: List[MemoryBlockInput]
    unallocated_processes: List[str]
    total_memory: int
    allocated_memory: int
    free_memory: int
    fragmentation: int
    execution_id: Optional[str] = None
    trace_events: List[TraceEvent] = []
