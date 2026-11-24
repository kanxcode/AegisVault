from pydantic import BaseModel
from typing import List, Optional, Dict

class ProcessInput(BaseModel):
    pid: str
    arrival_time: int
    burst_time: int
    priority: int = 0

class GanttBlock(BaseModel):
    pid: str
    start: int
    end: int
    duration: int

class SchedulingRequest(BaseModel):
    algorithm: str
    quantum: Optional[int] = None
    processes: List[ProcessInput]

from app.schemas.trace import TraceEvent

class SchedulingResult(BaseModel):
    algorithm: str
    gantt: List[GanttBlock]
    execution_order: List[str]
    completion_times: Dict[str, int]
    waiting_times: Dict[str, int]
    turnaround_times: Dict[str, int]
    response_times: Dict[str, int]
    average_waiting_time: float
    average_turnaround_time: float
    average_response_time: float
    cpu_utilization: float
    execution_id: Optional[str] = None
    trace_events: List[TraceEvent] = []
