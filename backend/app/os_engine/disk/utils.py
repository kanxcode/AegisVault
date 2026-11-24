from typing import List, Optional
from app.schemas.disk import DiskSimulationResult
from app.os_engine.trace_engine import TraceCollector

def build_disk_result(
    algorithm: str,
    service_order: List[int],
    movement_path: List[int],
    movements: List[int],
    collector: Optional[TraceCollector] = None
) -> DiskSimulationResult:
    total_movement = sum(movements)
    n = len(movements)
    average_seek = total_movement / n if n > 0 else 0
    
    return DiskSimulationResult(
        algorithm=algorithm,
        service_order=service_order,
        movement_path=movement_path,
        movements=movements,
        total_head_movement=total_movement,
        average_seek_distance=average_seek,
        execution_id=collector.execution_id if collector else None,
        trace_events=collector.get_events() if collector else []
    )
