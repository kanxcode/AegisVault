from pydantic import BaseModel
from typing import List, Optional

class DiskRequestInput(BaseModel):
    id: str
    track: int
    sector: int = 0

class DiskSimulationRequest(BaseModel):
    algorithm: str
    head: int
    requests: List[int] # Track numbers
    disk_size: int = 200 # Max track
    direction: str = "RIGHT" # RIGHT or LEFT

from app.schemas.trace import TraceEvent

class DiskSimulationResult(BaseModel):
    algorithm: str
    service_order: List[int]
    movement_path: List[int]
    movements: List[int]
    total_head_movement: int
    average_seek_distance: float
    execution_id: Optional[str] = None
    trace_events: List[TraceEvent] = []
