from typing import List, Optional
from app.schemas.disk import DiskSimulationResult
from app.os_engine.disk.utils import build_disk_result
from app.os_engine.trace_engine import TraceCollector

def schedule_fcfs(head: int, requests: List[int], collector: Optional[TraceCollector] = None) -> DiskSimulationResult:
    if collector is None:
        collector = TraceCollector(module="disk_scheduler")

    service_order = []
    movement_path = [head]
    movements = []
    
    current = head
    cum_movement = 0
    pending = list(requests)
    
    collector.emit(
        simulation_time=0,
        operation="disk_init",
        entity=f"HEAD@{head}",
        action="initialize",
        reason=f"Initialized Disk FCFS scheduler with head at track {head} and {len(requests)} I/O requests.",
        explanation="First-Come First-Served disk scheduling services pending I/O requests strictly in arrival order.",
        calculation={"initial_head": head, "requests": requests},
        state_before={"head": head, "pending": list(pending), "serviced": []},
        state_after={"head": head, "pending": list(pending), "serviced": []},
        affected_entities=[f"TRACK_{r}" for r in requests],
        next_step=f"Seek to first queued request track {requests[0] if requests else 'None'}"
    )

    for step_idx, req in enumerate(requests):
        dist = abs(current - req)
        direction = "RIGHT (Increasing)" if req > current else ("LEFT (Decreasing)" if req < current else "STATIONARY")
        cum_movement += dist
        
        collector.emit(
            simulation_time=step_idx + 1,
            operation="head_seek",
            entity=f"TRACK_{req}",
            action="seek_and_service",
            reason=f"Track {req} is next in FCFS queue order (seek distance: {dist} tracks).",
            explanation=f"Head moved from track {current} to {req} moving {direction}. Distance = |{current} - {req}| = {dist} tracks.",
            calculation={
                "previous_head": current,
                "target_track": req,
                "seek_distance": dist,
                "direction": direction,
                "cumulative_head_movement": cum_movement
            },
            state_before={"head": current, "pending": list(pending), "serviced": list(service_order)},
            state_after={
                "head": req,
                "pending": [r for r in pending if r != req or pending.count(r) > 1],
                "serviced": service_order + [req],
                "cumulative_movement": cum_movement
            },
            affected_entities=[f"TRACK_{req}"],
            next_step=f"Service track {requests[step_idx+1] if step_idx+1 < len(requests) else 'End'}"
        )

        service_order.append(req)
        movement_path.append(req)
        movements.append(dist)
        current = req
        pending.remove(req)
        
    return build_disk_result("FCFS", service_order, movement_path, movements, collector=collector)
