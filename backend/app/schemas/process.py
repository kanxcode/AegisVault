from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from app.schemas.trace import TraceEvent

class ProcessCreate(BaseModel):
    pid: str
    name: str
    state: str = "READY"
    arrival_time: int = 0
    burst_time: int = 20
    priority: int = 1
    cpu_time: int = 0
    memory: int = 128

class ProcessStateUpdate(BaseModel):
    state: str
    trigger: Optional[str] = None
    reason: Optional[str] = None

class ProcessResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    pid: str
    name: str
    state: str
    arrival_time: int
    burst_time: int
    priority: int
    cpu_time: int
    memory: int
    last_transition_reason: Optional[str] = None
    execution_id: Optional[str] = None
    trace_events: List[TraceEvent] = []
