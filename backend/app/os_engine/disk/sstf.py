from typing import List, Optional
from app.schemas.disk import DiskSimulationResult
from app.os_engine.disk.utils import build_disk_result
from app.os_engine.trace_engine import TraceCollector

def schedule_sstf(head: int, requests: List[int], collector: Optional[TraceCollector] = None) -> DiskSimulationResult:
    if collector is None:
        collector = TraceCollector(module="disk_scheduler")

    service_order = []
    movement_path = [head]
    movements = []
    
    pending = list(requests)
    current = head
    cum_movement = 0
    step_idx = 0
    
    collector.emit(
        simulation_time=0,
        operation="disk_init",
        entity=f"HEAD@{head}",
        action="initialize",
        reason=f"Initialized Disk SSTF with head at track {head} and {len(requests)} I/O requests.",
        explanation="Shortest Seek Time First selects the pending I/O request closest to the current head position.",
        calculation={"initial_head": head, "pending_requests": requests},
        state_before={"head": head, "pending": list(pending), "serviced": []},
        state_after={"head": head, "pending": list(pending), "serviced": []},
        affected_entities=[f"TRACK_{r}" for r in requests],
        next_step="Calculate distances to all pending tracks"
    )

    while pending:
        step_idx += 1
        # Calculate distance to every pending request
        distances = {r: abs(r - current) for r in pending}
        closest = min(pending, key=lambda req: distances[req])
        min_dist = distances[closest]
        direction = "RIGHT (Increasing)" if closest > current else ("LEFT (Decreasing)" if closest < current else "STATIONARY")
        cum_movement += min_dist
        
        competing_comparisons = {
            f"TRACK_{r}": f"Distance {d} tracks > min {min_dist} tracks"
            for r, d in distances.items() if r != closest
        }

        collector.emit(
            simulation_time=step_idx,
            operation="head_seek",
            entity=f"TRACK_{closest}",
            action="seek_and_service",
            reason=f"Track {closest} has minimum seek distance ({min_dist} tracks) from current head {current}.",
            explanation=(
                f"SSTF rule: min(|head - target|). Selected track {closest} with distance {min_dist}. "
                + (f"Competitors rejected: {competing_comparisons}" if competing_comparisons else "Last pending request.")
            ),
            calculation={
                "current_head": current,
                "target_track": closest,
                "seek_distance": min_dist,
                "direction": direction,
                "all_candidate_distances": distances,
                "cumulative_movement": cum_movement
            },
            state_before={"head": current, "pending": list(pending), "serviced": list(service_order)},
            state_after={
                "head": closest,
                "pending": [r for r in pending if r != closest],
                "serviced": service_order + [closest],
                "cumulative_movement": cum_movement
            },
            affected_entities=[f"TRACK_{closest}"],
            next_step="Select next nearest pending track" if len(pending) > 1 else "Service final track"
        )

        pending.remove(closest)
        service_order.append(closest)
        movement_path.append(closest)
        movements.append(min_dist)
        current = closest
        
    return build_disk_result("SSTF", service_order, movement_path, movements, collector=collector)
