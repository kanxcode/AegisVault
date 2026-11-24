import copy
from typing import List, Optional
from app.schemas.memory import MemoryBlockInput, ProcessMemoryRequest, AllocationResult, MemorySimulationResult
from app.os_engine.memory.utils import build_memory_result
from app.os_engine.trace_engine import TraceCollector

def allocate_best_fit(
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
        reason=f"Initialized Best Fit memory simulation with {len(mem_blocks)} blocks and {len(processes)} requests.",
        explanation="Best Fit searches the entire memory map to find the SMALLEST free block that is at least as large as the requested partition.",
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
        best_idx = -1
        best_size = float('inf')
        candidates_inspected = []
        
        collector.emit(
            simulation_time=sim_step,
            operation="allocation_request",
            entity=process.pid,
            action="request",
            reason=f"Process {process.pid} requested {process.size} MB memory partition.",
            explanation="Best Fit evaluates ALL free blocks to locate the one with minimum leftover space (min(block.size - requested)).",
            calculation={"pid": process.pid, "requested_size": process.size},
            state_before={"memory_map": [{"id": b.id, "size": b.size, "status": b.status} for b in mem_blocks]},
            state_after={"memory_map": [{"id": b.id, "size": b.size, "status": b.status} for b in mem_blocks]},
            affected_entities=[process.pid],
            next_step=f"Inspect all memory blocks for optimal fit"
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
            is_better = block.size < best_size
            candidates_inspected.append({
                "block_id": block.id,
                "size": block.size,
                "status": block.status,
                "qualifies": True,
                "leftover": leftover,
                "is_current_best": is_better,
                "reason": f"Qualifies with {leftover} MB leftover" + (" (new best fit)" if is_better else f" (worse than current best {best_size} MB)")
            })

            if is_better:
                best_size = block.size
                best_idx = i

        if best_idx != -1:
            block = mem_blocks[best_idx]
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
                mem_blocks.insert(best_idx + 1, new_block)
                split_info = f"Partition split: {block.id} allocated ({process.size} MB), created {new_block.id} ({leftover} MB free)."

            collector.emit(
                simulation_time=sim_step + 0.5,
                operation="block_allocation",
                entity=block.id,
                action="allocated",
                reason=f"Block {block.id} (size {orig_size} MB) chosen as Best Fit for {process.pid} ({process.size} MB).",
                explanation=(
                    f"Best Fit selected the smallest sufficient block. Leftover partition: {leftover} MB. "
                    f"{split_info} Note: Best Fit can produce very small leftover fragments."
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

    return build_memory_result("BEST_FIT", mem_blocks, processes, allocations, unallocated, collector=collector)
