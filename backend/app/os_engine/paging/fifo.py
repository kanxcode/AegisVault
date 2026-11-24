from typing import List, Dict, Any, Optional
from app.os_engine.trace_engine import TraceCollector

def simulate_fifo(
    reference_string: List[int], 
    frame_count: int,
    collector: Optional[TraceCollector] = None
) -> Dict[str, Any]:
    if collector is None:
        collector = TraceCollector(module="paging")

    frames: List[Optional[int]] = [None] * frame_count
    steps = []
    faults = 0
    hits = 0
    fifo_queue = [] # Queue of frames by insertion order

    collector.emit(
        simulation_time=0,
        operation="paging_init",
        entity="RAM_FRAMES",
        action="initialize",
        reason=f"Initialized FIFO Page Replacement simulation with {frame_count} frames and {len(reference_string)} references.",
        explanation="First-In First-Out replaces the oldest page loaded into physical memory frames when a page fault occurs.",
        calculation={"frame_count": frame_count, "reference_string": reference_string},
        state_before={"frames": list(frames), "fifo_queue": []},
        state_after={"frames": list(frames), "fifo_queue": []},
        affected_entities=[f"FRAME_{i}" for i in range(frame_count)],
        next_step=f"Reference first page: {reference_string[0] if reference_string else 'None'}"
    )

    for step_idx, page in enumerate(reference_string):
        sim_time = step_idx + 1
        if page in frames:
            hits += 1
            frame_idx = frames.index(page)
            collector.emit(
                simulation_time=sim_time,
                operation="page_reference",
                entity=f"PAGE_{page}",
                action="hit",
                reason=f"Page {page} is already resident in Frame {frame_idx}.",
                explanation=f"Page Hit: Reference to page {page} resolved directly in frame {frame_idx} without I/O page fault.",
                calculation={"page": page, "resident_frame": frame_idx, "hit": True, "cumulative_hits": hits},
                state_before={"frames": list(frames), "fifo_queue": list(fifo_queue)},
                state_after={"frames": list(frames), "fifo_queue": list(fifo_queue)},
                affected_entities=[f"PAGE_{page}", f"FRAME_{frame_idx}"],
                next_step=f"Next reference: {reference_string[step_idx+1] if step_idx+1 < len(reference_string) else 'Done'}"
            )
            steps.append({
                "page": page,
                "frames": list(frames),
                "hit": True,
                "victim": None
            })
        else:
            faults += 1
            victim = None
            if None in frames:
                empty_idx = frames.index(None)
                frames[empty_idx] = page
                fifo_queue.append(page)
                
                collector.emit(
                    simulation_time=sim_time,
                    operation="page_fault_allocation",
                    entity=f"PAGE_{page}",
                    action="fault_allocated",
                    reason=f"Page Fault: Page {page} not in memory. Allocated into empty Frame {empty_idx}.",
                    explanation=f"Free physical frame available. Page {page} loaded into Frame {empty_idx} without eviction.",
                    calculation={"page": page, "allocated_frame": empty_idx, "fault": True, "cumulative_faults": faults},
                    state_before={"frames": [f for f in frames if f != page], "fifo_queue": list(fifo_queue[:-1])},
                    state_after={"frames": list(frames), "fifo_queue": list(fifo_queue)},
                    affected_entities=[f"PAGE_{page}", f"FRAME_{empty_idx}"],
                    status="FAULT",
                    next_step=f"Next reference: {reference_string[step_idx+1] if step_idx+1 < len(reference_string) else 'Done'}"
                )
            else:
                victim = fifo_queue.pop(0)
                v_idx = frames.index(victim)
                frames[v_idx] = page
                fifo_queue.append(page)

                collector.emit(
                    simulation_time=sim_time,
                    operation="page_replacement",
                    entity=f"PAGE_{page}",
                    action="victim_replaced",
                    reason=f"Page Fault: Page {page} not in memory. Replaced oldest page {victim} (in Frame {v_idx}) using FIFO.",
                    explanation=f"Frames are full. FIFO selected page {victim} as victim because it was inserted earliest. Page {page} replaces it.",
                    calculation={"page": page, "victim": victim, "frame": v_idx, "old_queue": [victim] + list(fifo_queue[:-1]), "new_queue": list(fifo_queue)},
                    state_before={"frames": [victim if i == v_idx else frames[i] for i in range(frame_count)]},
                    state_after={"frames": list(frames), "fifo_queue": list(fifo_queue)},
                    affected_entities=[f"PAGE_{page}", f"PAGE_{victim}", f"FRAME_{v_idx}"],
                    status="FAULT",
                    next_step=f"Next reference: {reference_string[step_idx+1] if step_idx+1 < len(reference_string) else 'Done'}"
                )
                
            steps.append({
                "page": page,
                "frames": list(frames),
                "hit": False,
                "victim": victim
            })

    total = len(reference_string)
    fault_rate = (faults / total * 100) if total > 0 else 0
    hit_rate = (hits / total * 100) if total > 0 else 0

    return {
        "algorithm": "FIFO",
        "frame_count": frame_count,
        "total_references": total,
        "page_faults": faults,
        "hits": hits,
        "fault_rate": round(fault_rate, 2),
        "hit_rate": round(hit_rate, 2),
        "steps": steps,
        "execution_id": collector.execution_id,
        "trace_events": collector.get_events()
    }
