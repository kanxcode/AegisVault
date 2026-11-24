from typing import List, Optional
from app.schemas.disk import DiskSimulationResult
from app.os_engine.disk.utils import build_disk_result
from app.os_engine.trace_engine import TraceCollector

def schedule_scan(
    head: int, 
    requests: List[int], 
    disk_size: int, 
    direction: str,
    collector: Optional[TraceCollector] = None
) -> DiskSimulationResult:
    if collector is None:
        collector = TraceCollector(module="disk_scheduler")

    service_order = []
    movement_path = [head]
    movements = []
    
    pending = sorted(requests)
    left = [r for r in pending if r < head]
    right = [r for r in pending if r >= head]
    
    current = head
    cum_movement = 0
    step_counter = 0

    collector.emit(
        simulation_time=0,
        operation="disk_init",
        entity=f"HEAD@{head}",
        action="initialize",
        reason=f"Initialized Disk SCAN (Elevator) algorithm with head at {head}, direction {direction}, disk size {disk_size}.",
        explanation="SCAN sweeps the disk head in the chosen direction servicing all requests encountered, travels to disk boundary, then reverses.",
        calculation={"head": head, "direction": direction, "disk_size": disk_size, "left_tracks": left, "right_tracks": right},
        state_before={"head": head, "direction": direction, "pending": list(requests), "serviced": []},
        state_after={"head": head, "direction": direction, "pending": list(requests), "serviced": []},
        affected_entities=[f"TRACK_{r}" for r in requests],
        next_step=f"Sweep head in {direction} direction"
    )

    if direction == "RIGHT":
        # Service rightward requests
        for r in right:
            step_counter += 1
            dist = abs(current - r)
            cum_movement += dist
            collector.emit(
                simulation_time=step_counter,
                operation="head_seek",
                entity=f"TRACK_{r}",
                action="seek_and_service",
                reason=f"Track {r} reached during RIGHT sweep (seek distance: {dist} tracks).",
                explanation=f"SCAN moving RIGHT. Head advances from {current} to {r}. Distance = |{current} - {r}| = {dist}.",
                calculation={"previous_head": current, "target_track": r, "distance": dist, "cumulative_movement": cum_movement},
                state_before={"head": current, "direction": "RIGHT", "serviced": list(service_order)},
                state_after={"head": r, "direction": "RIGHT", "serviced": service_order + [r], "cumulative_movement": cum_movement},
                affected_entities=[f"TRACK_{r}"],
                next_step="Continue sweeping RIGHT" if r != right[-1] else ("Move to boundary then reverse" if left else "Finished")
            )
            service_order.append(r)
            movement_path.append(r)
            movements.append(dist)
            current = r
            
        if left:
            boundary = disk_size - 1
            if current != boundary:
                step_counter += 1
                dist = abs(current - boundary)
                cum_movement += dist
                collector.emit(
                    simulation_time=step_counter,
                    operation="boundary_seek",
                    entity=f"BOUNDARY_{boundary}",
                    action="reach_boundary_and_reverse",
                    reason=f"Reached upper disk boundary track {boundary}. Reversing sweep direction to LEFT.",
                    explanation=f"SCAN algorithm requires moving to disk boundary ({boundary}) before reversing direction to service opposite requests.",
                    calculation={"previous_head": current, "boundary": boundary, "seek_distance": dist, "cumulative_movement": cum_movement},
                    state_before={"head": current, "direction": "RIGHT"},
                    state_after={"head": boundary, "direction": "LEFT", "cumulative_movement": cum_movement},
                    affected_entities=[f"BOUNDARY_{boundary}"],
                    next_step="Sweep LEFT to service remaining requests"
                )
                movement_path.append(boundary)
                movements.append(dist)
                current = boundary
                
            for r in reversed(left):
                step_counter += 1
                dist = abs(current - r)
                cum_movement += dist
                collector.emit(
                    simulation_time=step_counter,
                    operation="head_seek",
                    entity=f"TRACK_{r}",
                    action="seek_and_service",
                    reason=f"Track {r} reached during reverse LEFT sweep (seek distance: {dist} tracks).",
                    explanation=f"SCAN moving LEFT after boundary turnaround. Head moves from {current} to {r}.",
                    calculation={"previous_head": current, "target_track": r, "distance": dist, "cumulative_movement": cum_movement},
                    state_before={"head": current, "direction": "LEFT", "serviced": list(service_order)},
                    state_after={"head": r, "direction": "LEFT", "serviced": service_order + [r], "cumulative_movement": cum_movement},
                    affected_entities=[f"TRACK_{r}"],
                    next_step="Continue sweeping LEFT" if r != left[0] else "Simulation complete"
                )
                service_order.append(r)
                movement_path.append(r)
                movements.append(dist)
                current = r
    else: # LEFT
        for r in reversed(left):
            step_counter += 1
            dist = abs(current - r)
            cum_movement += dist
            collector.emit(
                simulation_time=step_counter,
                operation="head_seek",
                entity=f"TRACK_{r}",
                action="seek_and_service",
                reason=f"Track {r} reached during LEFT sweep (seek distance: {dist} tracks).",
                explanation=f"SCAN moving LEFT. Head advances from {current} to {r}. Distance = |{current} - {r}| = {dist}.",
                calculation={"previous_head": current, "target_track": r, "distance": dist, "cumulative_movement": cum_movement},
                state_before={"head": current, "direction": "LEFT", "serviced": list(service_order)},
                state_after={"head": r, "direction": "LEFT", "serviced": service_order + [r], "cumulative_movement": cum_movement},
                affected_entities=[f"TRACK_{r}"],
                next_step="Continue sweeping LEFT" if r != left[0] else ("Move to boundary 0 then reverse" if right else "Finished")
            )
            service_order.append(r)
            movement_path.append(r)
            movements.append(dist)
            current = r
            
        if right:
            boundary = 0
            if current != boundary:
                step_counter += 1
                dist = abs(current - boundary)
                cum_movement += dist
                collector.emit(
                    simulation_time=step_counter,
                    operation="boundary_seek",
                    entity=f"BOUNDARY_{boundary}",
                    action="reach_boundary_and_reverse",
                    reason=f"Reached lower disk boundary track {boundary}. Reversing sweep direction to RIGHT.",
                    explanation=f"SCAN reached inner cylinder boundary (0). Reversing to service remaining requests in RIGHT direction.",
                    calculation={"previous_head": current, "boundary": boundary, "seek_distance": dist, "cumulative_movement": cum_movement},
                    state_before={"head": current, "direction": "LEFT"},
                    state_after={"head": boundary, "direction": "RIGHT", "cumulative_movement": cum_movement},
                    affected_entities=[f"BOUNDARY_{boundary}"],
                    next_step="Sweep RIGHT to service remaining requests"
                )
                movement_path.append(boundary)
                movements.append(dist)
                current = boundary
                
            for r in right:
                step_counter += 1
                dist = abs(current - r)
                cum_movement += dist
                collector.emit(
                    simulation_time=step_counter,
                    operation="head_seek",
                    entity=f"TRACK_{r}",
                    action="seek_and_service",
                    reason=f"Track {r} reached during reverse RIGHT sweep (seek distance: {dist} tracks).",
                    explanation=f"SCAN moving RIGHT after boundary turnaround. Head moves from {current} to {r}.",
                    calculation={"previous_head": current, "target_track": r, "distance": dist, "cumulative_movement": cum_movement},
                    state_before={"head": current, "direction": "RIGHT", "serviced": list(service_order)},
                    state_after={"head": r, "direction": "RIGHT", "serviced": service_order + [r], "cumulative_movement": cum_movement},
                    affected_entities=[f"TRACK_{r}"],
                    next_step="Continue sweeping RIGHT" if r != right[-1] else "Simulation complete"
                )
                service_order.append(r)
                movement_path.append(r)
                movements.append(dist)
                current = r
                
    return build_disk_result("SCAN", service_order, movement_path, movements, collector=collector)
