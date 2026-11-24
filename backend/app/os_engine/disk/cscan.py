from typing import List, Optional
from app.schemas.disk import DiskSimulationResult
from app.os_engine.disk.utils import build_disk_result
from app.os_engine.trace_engine import TraceCollector

def schedule_cscan(
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
        reason=f"Initialized Disk C-SCAN (Circular SCAN) with head at {head}, direction {direction}, disk size {disk_size}.",
        explanation="C-SCAN moves head in one direction servicing requests, wraps around to opposite boundary without servicing requests, and continues in the SAME direction to provide uniform wait times.",
        calculation={"head": head, "direction": direction, "disk_size": disk_size, "left_tracks": left, "right_tracks": right},
        state_before={"head": head, "direction": direction, "pending": list(requests), "serviced": []},
        state_after={"head": head, "direction": direction, "pending": list(requests), "serviced": []},
        affected_entities=[f"TRACK_{r}" for r in requests],
        next_step=f"Sweep head in {direction} direction"
    )

    if direction == "RIGHT":
        for r in right:
            step_counter += 1
            dist = abs(current - r)
            cum_movement += dist
            collector.emit(
                simulation_time=step_counter,
                operation="head_seek",
                entity=f"TRACK_{r}",
                action="seek_and_service",
                reason=f"Track {r} serviced during RIGHT sweep (seek distance: {dist} tracks).",
                explanation=f"C-SCAN head moves outward to track {r}. Distance = |{current} - {r}| = {dist}.",
                calculation={"previous_head": current, "target_track": r, "distance": dist, "cumulative_movement": cum_movement},
                state_before={"head": current, "direction": "RIGHT", "serviced": list(service_order)},
                state_after={"head": r, "direction": "RIGHT", "serviced": service_order + [r], "cumulative_movement": cum_movement},
                affected_entities=[f"TRACK_{r}"],
                next_step="Continue sweeping RIGHT" if r != right[-1] else ("Move to boundary and wrap around" if left else "Finished")
            )
            service_order.append(r)
            movement_path.append(r)
            movements.append(dist)
            current = r
            
        if left:
            boundary_max = disk_size - 1
            if current != boundary_max:
                step_counter += 1
                dist = abs(current - boundary_max)
                cum_movement += dist
                collector.emit(
                    simulation_time=step_counter,
                    operation="boundary_seek",
                    entity=f"BOUNDARY_{boundary_max}",
                    action="reach_outer_boundary",
                    reason=f"Reached maximum disk boundary cylinder {boundary_max}.",
                    explanation="C-SCAN reaches the outer cylinder boundary before executing circular wrap-around jump.",
                    calculation={"previous_head": current, "boundary": boundary_max, "distance": dist, "cumulative_movement": cum_movement},
                    state_before={"head": current},
                    state_after={"head": boundary_max, "cumulative_movement": cum_movement},
                    affected_entities=[f"BOUNDARY_{boundary_max}"],
                    next_step="Execute circular return jump to cylinder 0"
                )
                movement_path.append(boundary_max)
                movements.append(dist)
                current = boundary_max
                
            boundary_min = 0
            step_counter += 1
            dist = abs(current - boundary_min)
            cum_movement += dist
            collector.emit(
                simulation_time=step_counter,
                operation="circular_wrap_jump",
                entity="HEAD_WRAP",
                action="wrap_around",
                reason=f"Circular wrap-around jump from outer boundary {boundary_max} to inner boundary 0 ({dist} tracks).",
                explanation="C-SCAN resets head to opposite boundary without servicing requests to ensure uniform waiting time across all cylinders.",
                calculation={"from_track": current, "to_track": boundary_min, "jump_distance": dist, "cumulative_movement": cum_movement},
                state_before={"head": current, "direction": "RIGHT"},
                state_after={"head": boundary_min, "direction": "RIGHT", "cumulative_movement": cum_movement},
                affected_entities=["HEAD"],
                next_step="Resume sweeping RIGHT from track 0"
            )
            movement_path.append(boundary_min)
            movements.append(dist)
            current = boundary_min
            
            for r in left:
                step_counter += 1
                dist = abs(current - r)
                cum_movement += dist
                collector.emit(
                    simulation_time=step_counter,
                    operation="head_seek",
                    entity=f"TRACK_{r}",
                    action="seek_and_service",
                    reason=f"Track {r} serviced after circular wrap-around (seek distance: {dist} tracks).",
                    explanation=f"C-SCAN continuing in same direction (RIGHT) from cylinder 0. Head moves {current} -> {r}.",
                    calculation={"previous_head": current, "target_track": r, "distance": dist, "cumulative_movement": cum_movement},
                    state_before={"head": current, "serviced": list(service_order)},
                    state_after={"head": r, "serviced": service_order + [r], "cumulative_movement": cum_movement},
                    affected_entities=[f"TRACK_{r}"],
                    next_step="Continue sweeping RIGHT" if r != left[-1] else "Simulation complete"
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
                reason=f"Track {r} serviced during LEFT sweep (seek distance: {dist} tracks).",
                explanation=f"C-SCAN head moves inward to track {r}. Distance = |{current} - {r}| = {dist}.",
                calculation={"previous_head": current, "target_track": r, "distance": dist, "cumulative_movement": cum_movement},
                state_before={"head": current, "direction": "LEFT", "serviced": list(service_order)},
                state_after={"head": r, "direction": "LEFT", "serviced": service_order + [r], "cumulative_movement": cum_movement},
                affected_entities=[f"TRACK_{r}"],
                next_step="Continue sweeping LEFT" if r != left[0] else ("Move to boundary 0 and wrap around" if right else "Finished")
            )
            service_order.append(r)
            movement_path.append(r)
            movements.append(dist)
            current = r
            
        if right:
            boundary_min = 0
            if current != boundary_min:
                step_counter += 1
                dist = abs(current - boundary_min)
                cum_movement += dist
                collector.emit(
                    simulation_time=step_counter,
                    operation="boundary_seek",
                    entity=f"BOUNDARY_{boundary_min}",
                    action="reach_inner_boundary",
                    reason=f"Reached minimum disk boundary cylinder 0.",
                    explanation="C-SCAN reaches inner cylinder boundary before executing circular wrap-around jump.",
                    calculation={"previous_head": current, "boundary": boundary_min, "distance": dist, "cumulative_movement": cum_movement},
                    state_before={"head": current},
                    state_after={"head": boundary_min, "cumulative_movement": cum_movement},
                    affected_entities=[f"BOUNDARY_{boundary_min}"],
                    next_step=f"Execute circular return jump to cylinder {disk_size - 1}"
                )
                movement_path.append(boundary_min)
                movements.append(dist)
                current = boundary_min
                
            boundary_max = disk_size - 1
            step_counter += 1
            dist = abs(current - boundary_max)
            cum_movement += dist
            collector.emit(
                simulation_time=step_counter,
                operation="circular_wrap_jump",
                entity="HEAD_WRAP",
                action="wrap_around",
                reason=f"Circular wrap-around jump from 0 to outer boundary {boundary_max} ({dist} tracks).",
                explanation="C-SCAN resets head to outer boundary without servicing requests to ensure uniform waiting time across all cylinders.",
                calculation={"from_track": current, "to_track": boundary_max, "jump_distance": dist, "cumulative_movement": cum_movement},
                state_before={"head": current, "direction": "LEFT"},
                state_after={"head": boundary_max, "direction": "LEFT", "cumulative_movement": cum_movement},
                affected_entities=["HEAD"],
                next_step=f"Resume sweeping LEFT from track {boundary_max}"
            )
            movement_path.append(boundary_max)
            movements.append(dist)
            current = boundary_max
            
            for r in reversed(right):
                step_counter += 1
                dist = abs(current - r)
                cum_movement += dist
                collector.emit(
                    simulation_time=step_counter,
                    operation="head_seek",
                    entity=f"TRACK_{r}",
                    action="seek_and_service",
                    reason=f"Track {r} serviced after circular wrap-around (seek distance: {dist} tracks).",
                    explanation=f"C-SCAN continuing in same direction (LEFT) from cylinder {boundary_max}. Head moves {current} -> {r}.",
                    calculation={"previous_head": current, "target_track": r, "distance": dist, "cumulative_movement": cum_movement},
                    state_before={"head": current, "serviced": list(service_order)},
                    state_after={"head": r, "serviced": service_order + [r], "cumulative_movement": cum_movement},
                    affected_entities=[f"TRACK_{r}"],
                    next_step="Continue sweeping LEFT" if r != right[0] else "Simulation complete"
                )
                service_order.append(r)
                movement_path.append(r)
                movements.append(dist)
                current = r
                
    return build_disk_result("C-SCAN", service_order, movement_path, movements, collector=collector)
