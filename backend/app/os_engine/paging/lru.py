from typing import List, Dict, Any, Optional
from app.os_engine.trace_engine import TraceCollector

def simulate_lru(
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
    recent_usage: Dict[int, int] = {} # page -> last used step index

    collector.emit(
        simulation_time=0,
        operation="paging_init",
        entity="RAM_FRAMES",
        action="initialize",
        reason=f"Initialized LRU Page Replacement simulation with {frame_count} frames and {len(reference_string)} references.",
        explanation="Least Recently Used replaces the page that has not been referenced for the longest period of time.",
        calculation={"frame_count": frame_count, "reference_string": reference_string},
        state_before={"frames": list(frames)},
        state_after={"frames": list(frames)},
        affected_entities=[f"FRAME_{i}" for i in range(frame_count)],
        next_step=f"Reference first page: {reference_string[0] if reference_string else 'None'}"
    )

    for step_idx, page in enumerate(reference_string):
        sim_time = step_idx + 1
        if page in frames:
            hits += 1
            frame_idx = frames.index(page)
            prev_usage = recent_usage.get(page, step_idx)
            recent_usage[page] = step_idx
            
            collector.emit(
                simulation_time=sim_time,
                operation="page_reference",
                entity=f"PAGE_{page}",
                action="hit",
                reason=f"Page {page} is already resident in Frame {frame_idx}. Updated last-used access timestamp to step {step_idx}.",
                explanation=f"Page Hit: Accessing page {page} updates its LRU recency to current reference index {step_idx}.",
                calculation={"page": page, "resident_frame": frame_idx, "last_used_step": prev_usage, "new_used_step": step_idx},
                state_before={"frames": list(frames), "recent_usage": dict(recent_usage)},
                state_after={"frames": list(frames), "recent_usage": dict(recent_usage)},
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
                recent_usage[page] = step_idx
                
                collector.emit(
                    simulation_time=sim_time,
                    operation="page_fault_allocation",
                    entity=f"PAGE_{page}",
                    action="fault_allocated",
                    reason=f"Page Fault: Page {page} not in memory. Allocated into empty Frame {empty_idx}.",
                    explanation=f"Free physical frame available. Page {page} loaded into Frame {empty_idx} with access timestamp {step_idx}.",
                    calculation={"page": page, "allocated_frame": empty_idx, "access_step": step_idx, "cumulative_faults": faults},
                    state_before={"frames": [f for f in frames if f != page]},
                    state_after={"frames": list(frames), "recent_usage": dict(recent_usage)},
                    affected_entities=[f"PAGE_{page}", f"FRAME_{empty_idx}"],
                    status="FAULT",
                    next_step=f"Next reference: {reference_string[step_idx+1] if step_idx+1 < len(reference_string) else 'Done'}"
                )
            else:
                # Find the page in frames with minimum last used index
                usage_comparison = {p: recent_usage.get(p, -1) for p in frames if p is not None}
                victim = min(frames, key=lambda p: recent_usage.get(p, -1))
                v_idx = frames.index(victim)
                frames[v_idx] = page
                recent_usage[page] = step_idx

                collector.emit(
                    simulation_time=sim_time,
                    operation="page_replacement",
                    entity=f"PAGE_{page}",
                    action="victim_replaced",
                    reason=f"Page Fault: Page {page} not in memory. Evicted least recently used page {victim} from Frame {v_idx}.",
                    explanation=(
                        f"LRU examined last access times of resident pages {usage_comparison}. "
                        f"Page {victim} had oldest access time ({recent_usage.get(victim, -1)}) and was chosen as victim."
                    ),
                    calculation={
                        "page": page,
                        "victim": victim,
                        "frame": v_idx,
                        "resident_access_history": usage_comparison,
                        "victim_last_used": recent_usage.get(victim, -1)
                    },
                    state_before={"frames": [victim if i == v_idx else frames[i] for i in range(frame_count)]},
                    state_after={"frames": list(frames), "recent_usage": dict(recent_usage)},
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
        "algorithm": "LRU",
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
