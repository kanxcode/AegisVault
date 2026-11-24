from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from app.schemas.trace import TraceEvent

class TransactionCreate(BaseModel):
    query: str

class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: str
    status: str
    query: str
    duration_ms: int
    created_at: str
    acid_stage: Optional[str] = None
    acid_explanation: Optional[str] = None
    execution_id: Optional[str] = None
    trace_events: List[TraceEvent] = []

class LockResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    tx_id: str
    resource: str
    lock_type: str

class DeadlockNode(BaseModel):
    tx_id: str
    waiting_for: str
    resource: str

class DeadlockSimulationResponse(BaseModel):
    deadlock_detected: bool
    cycle: List[str]
    wait_for_graph: List[DeadlockNode]
    resolution_action: Optional[str] = None
    message: str
    execution_id: Optional[str] = None
    trace_events: List[TraceEvent] = []
