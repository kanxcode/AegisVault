from typing import List, Dict, Any, Optional
from app.os_engine.trace_engine import TraceCollector

def simulate_optimal(
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

    collector.emit(
        simulation_time=0,
        operation="paging_init",
        entity="RAM_FRAMES",
        action="initialize",
        reason=f"Initialized Optimal (Belady's) Page Replacement with {frame_count} frames and {len(reference_string)} references.",
        explanation="Optimal page replacement looks forward in time and replaces the page that will not be used for the longest period in the future.",
        calculation={"frame_count": frame_count, "reference_string": reference_string},
        state_before={"frames": list(frames)},
        state_after={"frames": list(frames)},
        affected_entities=[f"FRAME_{i}" for i in range(frame_count)],
        next_step=f"Reference first page: {reference_string[0] if reference_string else 'None'}"
    )

    for i, page in enumerate(reference_string):
        sim_time = i + 1
        if page in frames:
            hits += 1
            frame_idx = frames.index(page)
            collector.emit(
                simulation_time=sim_time,
                operation="page_reference",
                entity=f"PAGE_{page}",
                action="hit",
                reason=f"Page {page} is already resident in Frame {frame_idx}.",
                explanation=f"Page Hit: Reference to page {page} resolved directly in frame {frame_idx}.",
                calculation={"page": page, "resident_frame": frame_idx, "cumulative_hits": hits},
                state_before={"frames": list(frames)},
                state_after={"frames": list(frames)},
                affected_entities=[f"PAGE_{page}", f"FRAME_{frame_idx}"],
                next_step=f"Next reference: {reference_string[i+1] if i+1 < len(reference_string) else 'Done'}"
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
                
                collector.emit(
                    simulation_time=sim_time,
                    operation="page_fault_allocation",
                    entity=f"PAGE_{page}",
                    action="fault_allocated",
                    reason=f"Page Fault: Page {page} not in memory. Loaded into empty Frame {empty_idx}.",
                    explanation=f"Empty frame available in pool. Page {page} allocated to Frame {empty_idx} without eviction.",
                    calculation={"page": page, "allocated_frame": empty_idx, "cumulative_faults": faults},
                    state_before={"frames": [f for f in frames if f != page]},
                    state_after={"frames": list(frames)},
                    affected_entities=[f"PAGE_{page}", f"FRAME_{empty_idx}"],
                    status="FAULT",
                    next_step=f"Next reference: {reference_string[i+1] if i+1 < len(reference_string) else 'Done'}"
                )
            else:
                # Find page that will not be used for longest future duration
                future_refs = reference_string[i + 1:]
                farthest_idx = -1
                victim = frames[0]
                future_distances = {}

                for p in frames:
                    if p not in future_refs:
                        victim = p
                        future_distances[p] = "Never used again"
                        break
                    else:
                        next_use = future_refs.index(p)
                        future_distances[p] = f"Used in {next_use + 1} steps (index {i + 1 + next_use})"
                        if next_use > farthest_idx:
                            farthest_idx = next_use
                            victim = p
                
                v_idx = frames.index(victim)
                frames[v_idx] = page

                collector.emit(
                    simulation_time=sim_time,
                    operation="page_replacement",
                    entity=f"PAGE_{page}",
                    action="victim_replaced",
                    reason=f"Page Fault: Page {page} not in memory. Evicted optimal victim {victim} from Frame {v_idx}.",
                    explanation=(
                        f"Optimal evaluated future references of resident frames: {future_distances}. "
                        f"Page {victim} has the furthest (or no) next reference and was chosen as victim."
                    ),
                    calculation={
                        "page": page,
                        "victim": victim,
                        "frame": v_idx,
                        "future_usage_projections": future_distances
                    },
                    state_before={"frames": [victim if idx == v_idx else frames[idx] for idx in range(frame_count)]},
                    state_after={"frames": list(frames)},
                    affected_entities=[f"PAGE_{page}", f"PAGE_{victim}", f"FRAME_{v_idx}"],
                    status="FAULT",
                    next_step=f"Next reference: {reference_string[i+1] if i+1 < len(reference_string) else 'Done'}"
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
        "algorithm": "OPTIMAL",
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
