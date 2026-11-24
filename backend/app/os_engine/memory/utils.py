from typing import List, Dict, Any, Optional
from app.schemas.memory import MemoryBlockInput, ProcessMemoryRequest, AllocationResult, MemorySimulationResult
from app.os_engine.trace_engine import TraceCollector

def build_memory_result(
    algorithm: str,
    blocks: List[MemoryBlockInput],
    processes: List[ProcessMemoryRequest],
    allocations: List[AllocationResult],
    unallocated_processes: List[str],
    collector: Optional[TraceCollector] = None
) -> MemorySimulationResult:
    total_memory = sum(b.size for b in blocks)
    
    # The allocated_memory is the sum of sizes of ALL allocated blocks, including pre-existing ones
    allocated_memory = sum(b.size for b in blocks if b.status == "ALLOCATED")
    free_memory = sum(b.size for b in blocks if b.status == "FREE")
    
    fragmentation = free_memory  # External fragmentation
    
    return MemorySimulationResult(
        algorithm=algorithm,
        allocations=allocations,
        remaining_blocks=blocks,
        unallocated_processes=unallocated_processes,
        total_memory=total_memory,
        allocated_memory=allocated_memory,
        free_memory=free_memory,
        fragmentation=fragmentation,
        execution_id=collector.execution_id if collector else None,
        trace_events=collector.get_events() if collector else []
    )
