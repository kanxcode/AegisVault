import copy
from typing import List, Optional
from app.schemas.memory import MemoryBlockInput, ProcessMemoryRequest, AllocationResult, MemorySimulationResult
from app.os_engine.memory.utils import build_memory_result
from app.os_engine.trace_engine import TraceCollector

def allocate_worst_fit(
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
        reason=f"Initialized Worst Fit memory simulation with {len(mem_blocks)} blocks and {len(processes)} requests.",
        explanation="Worst Fit searches the entire memory map to find the LARGEST free block, aiming to leave behind the largest possible usable leftover hole.",
        calculation={
            "initial_blocks": [{"id": b.id, "size": b.size, "status": b.status} for b in mem_blocks],
            "requests": [{"pid": p.pid, "size": p.size} for p in processes]
        },
        state_before={"blocks": [{"id": b.id, "size": b.size, "status": b.status} for b in blocks]},
        state_after={"blocks": [{"id": b.id, "size": b.size, "status": b.status} for b in mem_blocks]},
        affected_entities=[b.id for b in mem_blocks],
        next_step=f"Process first request for {processes[0].pid if processes else 'None'}"
    )

    sim_step = 0
    for p_idx, process in enumerate(processes):
        sim_step += 1
        worst_idx = -1
        worst_size = -1
        candidates_inspected = []
        
        collector.emit(
            simulation_time=sim_step,
            operation="allocation_request",
            entity=process.pid,
            action="request",
            reason=f"Process {process.pid} requested {process.size} MB memory partition.",
            explanation="Worst Fit evaluates ALL free blocks to locate the one with MAXIMUM leftover space (max(block.size - requested)).",
            calculation={"pid": process.pid, "requested_size": process.size},
            state_before={"memory_map": [{"id": b.id, "size": b.size, "status": b.status} for b in mem_blocks]},
            state_after={"memory_map": [{"id": b.id, "size": b.size, "status": b.status} for b in mem_blocks]},
            affected_entities=[process.pid],
            next_step=f"Inspect all memory blocks for largest partition"
        )

        for i, block in enumerate(mem_blocks):
            if block.status != "FREE":
                candidates_inspected.append({
                    "block_id": block.id,
                    "size": block.size,
                    "status": block.status,
                    "qualifies": False,
                    "reason": "Already ALLOCATED"
                })
                continue

            if block.size < process.size:
                candidates_inspected.append({
                    "block_id": block.id,
                    "size": block.size,
                    "status": block.status,
                    "qualifies": False,
                    "reason": f"Size {block.size} MB < requested {process.size} MB"
                })
                continue

            leftover = block.size - process.size
            is_larger = block.size > worst_size
            candidates_inspected.append({
                "block_id": block.id,
                "size": block.size,
                "status": block.status,
                "qualifies": True,
                "leftover": leftover,
                "is_current_worst": is_larger,
                "reason": f"Qualifies with {leftover} MB leftover" + (" (new largest hole)" if is_larger else f" (smaller than current largest {worst_size} MB)")
            })

            if is_larger:
                worst_size = block.size
                worst_idx = i

        if worst_idx != -1:
            block = mem_blocks[worst_idx]
            orig_size = block.size
            allocations.append(AllocationResult(block_id=block.id, pid=process.pid, allocated_size=process.size))
            
            if block.size == process.size:
                block.status = "ALLOCATED"
                leftover = 0
                split_info = "Exact match: no split required."
            else:
                leftover = block.size - process.size
                block.size = process.size
                block.status = "ALLOCATED"
                
                new_block = MemoryBlockInput(
                    id=f"{block.id}_split_{process.pid}",
                    size=leftover,
                    status="FREE"
                )
                mem_blocks.insert(worst_idx + 1, new_block)
                split_info = f"Partition split: {block.id} allocated ({process.size} MB), created {new_block.id} ({leftover} MB free)."

            collector.emit(
                simulation_time=sim_step + 0.5,
                operation="block_allocation",
                entity=block.id,
                action="allocated",
                reason=f"Block {block.id} (size {orig_size} MB) chosen as Worst Fit for {process.pid} ({process.size} MB).",
                explanation=(
                    f"Worst Fit selected the largest block available ({orig_size} MB). Leftover partition: {leftover} MB. "
                    f"{split_info} Note: Worst Fit attempts to prevent small unusable fragments by keeping leftovers large."
                ),
                calculation={
                    "requested_size": process.size,
                    "selected_original_size": orig_size,
                    "leftover_free_size": leftover,
                    "all_candidates": candidates_inspected
                },
                state_before={"block_status": "FREE", "block_size": orig_size},
                state_after={"block_id": block.id, "status": "ALLOCATED", "size": process.size, "memory_map": [{"id": b.id, "size": b.size, "status": b.status} for b in mem_blocks]},
                affected_entities=[block.id, process.pid],
                next_step=f"Process next request ({processes[p_idx+1].pid if p_idx+1 < len(processes) else 'Done'})"
            )
        else:
            unallocated.append(process.pid)
            total_free = sum(b.size for b in mem_blocks if b.status == "FREE")
            collector.emit(
                simulation_time=sim_step + 0.5,
                operation="allocation_failed",
                entity=process.pid,
                action="unallocated",
                reason=f"No free block large enough for {process.pid}'s request of {process.size} MB.",
                explanation=f"All {len(candidates_inspected)} blocks inspected; none had capacity >= {process.size} MB. Total free RAM: {total_free} MB.",
                calculation={
                    "requested_size": process.size,
                    "total_free_memory": total_free,
                    "blocks_inspected": candidates_inspected
                },
                state_before={"unallocated_count": len(unallocated) - 1},
                state_after={"unallocated_count": len(unallocated), "unallocated": list(unallocated)},
                affected_entities=[process.pid],
                status="REJECTED",
                next_step=f"Process next request ({processes[p_idx+1].pid if p_idx+1 < len(processes) else 'Done'})"
            )

    return build_memory_result("WORST_FIT", mem_blocks, processes, allocations, unallocated, collector=collector)
