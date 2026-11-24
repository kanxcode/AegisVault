import copy
from typing import List, Optional
from app.schemas.memory import MemoryBlockInput, ProcessMemoryRequest, AllocationResult, MemorySimulationResult
from app.os_engine.memory.utils import build_memory_result
from app.os_engine.trace_engine import TraceCollector

def allocate_first_fit(
    blocks: List[MemoryBlockInput], 
    processes: List[ProcessMemoryRequest],
    collector: Optional[TraceCollector] = None
) -> MemorySimulationResult:
    if collector is None:
        collector = TraceCollector(module="memory_manager")

    mem_blocks = copy.deepcopy(blocks)
    allocations = []
    unallocated = []

    collector.emit(
        simulation_time=0,
        operation="memory_init",
        entity="RAM",
        action="initialize",
        reason=f"Initialized First Fit memory simulation with {len(mem_blocks)} blocks and {len(processes)} allocation requests.",
        explanation="First Fit scans memory from lowest address and allocates the FIRST free block large enough to satisfy the process request.",
        calculation={
            "initial_blocks": [{"id": b.id, "size": b.size, "status": b.status} for b in mem_blocks],
            "requests": [{"pid": p.pid, "size": p.size} for p in processes]
        },
        state_before={"blocks": [{"id": b.id, "size": b.size, "status": b.status} for b in blocks]},
        state_after={"blocks": [{"id": b.id, "size": b.size, "status": b.status} for b in mem_blocks]},
        affected_entities=[b.id for b in mem_blocks],
        next_step=f"Process first allocation request for {processes[0].pid if processes else 'None'}"
    )

    sim_step = 0
    for p_idx, process in enumerate(processes):
        sim_step += 1
        allocated = False
        candidates_inspected = []
        
        collector.emit(
            simulation_time=sim_step,
            operation="allocation_request",
            entity=process.pid,
            action="request",
            reason=f"Process {process.pid} requested {process.size} MB memory partition.",
            explanation="First Fit will scan memory blocks linearly from the start until a block with size >= requested is found.",
            calculation={"pid": process.pid, "requested_size": process.size},
            state_before={"memory_map": [{"id": b.id, "size": b.size, "status": b.status} for b in mem_blocks]},
            state_after={"memory_map": [{"id": b.id, "size": b.size, "status": b.status} for b in mem_blocks]},
            affected_entities=[process.pid],
            next_step=f"Scan memory blocks for {process.pid} ({process.size} MB)"
        )

        for i, block in enumerate(mem_blocks):
            if block.status != "FREE":
                candidates_inspected.append({
                    "block_id": block.id,
                    "size": block.size,
                    "status": block.status,
                    "qualifies": False,
                    "reason": f"Block {block.id} is already ALLOCATED"
                })
                continue
                
            if block.size < process.size:
                candidates_inspected.append({
                    "block_id": block.id,
                    "size": block.size,
                    "status": block.status,
                    "qualifies": False,
                    "reason": f"Block size {block.size} MB < requested {process.size} MB"
                })
                continue

            # Block qualifies! In First Fit, we immediately select the first qualifying block.
            candidates_inspected.append({
                "block_id": block.id,
                "size": block.size,
                "status": block.status,
                "qualifies": True,
                "reason": f"First qualifying block found (size {block.size} MB >= {process.size} MB)"
            })
            
            orig_size = block.size
            allocations.append(AllocationResult(block_id=block.id, pid=process.pid, allocated_size=process.size))
            
            if block.size == process.size:
                block.status = "ALLOCATED"
                split_info = "Exact match: no partition split required."
                leftover = 0
            else:
                leftover = block.size - process.size
                block.size = process.size
                block.status = "ALLOCATED"
                new_block = MemoryBlockInput(
                    id=f"{block.id}_split_{process.pid}",
                    size=leftover,
                    status="FREE"
                )
                mem_blocks.insert(i + 1, new_block)
                split_info = f"Partition split: {block.id} resized to {process.size} MB, new free block {new_block.id} created with {leftover} MB."

            collector.emit(
                simulation_time=sim_step + 0.5,
                operation="block_allocation",
                entity=block.id,
                action="allocated",
                reason=f"Block {block.id} selected for {process.pid} ({process.size} MB) using First Fit.",
                explanation=(
                    f"First Fit stopped at block {block.id} (original size: {orig_size} MB). {split_info} "
                    f"Free space remaining in block: {leftover} MB."
                ),
                calculation={
                    "requested_size": process.size,
                    "original_block_size": orig_size,
                    "allocated_size": process.size,
                    "leftover_free_size": leftover,
                    "inspected_blocks_count": len(candidates_inspected)
                },
                state_before={"block_status": "FREE", "block_size": orig_size},
                state_after={"block_id": block.id, "status": "ALLOCATED", "size": process.size, "memory_map": [{"id": b.id, "size": b.size, "status": b.status} for b in mem_blocks]},
                affected_entities=[block.id, process.pid],
                next_step=f"Process next request ({processes[p_idx+1].pid if p_idx+1 < len(processes) else 'Done'})"
            )
            allocated = True
            break

        if not allocated:
            unallocated.append(process.pid)
            total_free = sum(b.size for b in mem_blocks if b.status == "FREE")
            collector.emit(
                simulation_time=sim_step + 0.5,
                operation="allocation_failed",
                entity=process.pid,
                action="unallocated",
                reason=f"No contiguous free memory block could satisfy {process.pid}'s request of {process.size} MB.",
                explanation=(
                    f"Allocation failed. Inspected {len(candidates_inspected)} blocks. "
                    f"Total free memory in system is {total_free} MB, but lack of contiguous space represents External Fragmentation."
                ),
                calculation={
                    "requested_size": process.size,
                    "total_free_memory": total_free,
                    "blocks_inspected": candidates_inspected
                },
                state_before={"unallocated_count": len(unallocated) - 1},
                state_after={"unallocated_count": len(unallocated), "unallocated": list(unallocated)},
                affected_entities=[process.pid],
                status="REJECTED",
                next_step=f"Proceed to next request ({processes[p_idx+1].pid if p_idx+1 < len(processes) else 'Done'})"
            )

    return build_memory_result("FIRST_FIT", mem_blocks, processes, allocations, unallocated, collector=collector)
