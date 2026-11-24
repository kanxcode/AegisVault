from pydantic import BaseModel, ConfigDict
from typing import List, Dict, Any, Optional

class TraceEvent(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: str
    execution_id: str
    step_number: int
    simulation_time: float
    module: str
    operation: str
    entity: str
    action: str
    reason: str
    explanation: str
    calculation: Dict[str, Any] = {}
    state_before: Dict[str, Any] = {}
    state_after: Dict[str, Any] = {}
    affected_entities: List[str] = []
    next_step: str = ""
    status: str = "SUCCESS"

class ExecutionRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    execution_id: str
    module: str
    algorithm: str
    status: str = "COMPLETED"
    total_steps: int = 0
    final_simulation_time: float = 0.0
    input_params: Dict[str, Any] = {}
    summary_metrics: Dict[str, Any] = {}
    trace_events: List[TraceEvent] = []
    created_at: str

class ExecutionHistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    execution_id: str
    module: str
    algorithm: str
    status: str
    total_steps: int
    created_at: str
    summary_metrics: Dict[str, Any] = {}
