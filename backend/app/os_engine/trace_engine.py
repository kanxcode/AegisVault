import uuid
from typing import List, Dict, Any, Optional
from app.schemas.trace import TraceEvent

class TraceCollector:
    """
    Collects real-time trace events generated during algorithm execution.
    Events capture WHAT, WHY, HOW, WHERE, WHEN, STATE BEFORE, STATE AFTER, and NEXT STEP.
    """
    def __init__(self, module: str, execution_id: Optional[str] = None):
        self.execution_id = execution_id or f"exec-{uuid.uuid4().hex[:12]}"
        self.module = module
        self.events: List[TraceEvent] = []
        self.step_counter = 0

    def emit(
        self,
        simulation_time: float,
        operation: str,
        entity: str,
        action: str,
        reason: str,
        explanation: str,
        calculation: Optional[Dict[str, Any]] = None,
        state_before: Optional[Dict[str, Any]] = None,
        state_after: Optional[Dict[str, Any]] = None,
        affected_entities: Optional[List[str]] = None,
        next_step: str = "",
        status: str = "SUCCESS"
    ) -> TraceEvent:
        self.step_counter += 1
        event = TraceEvent(
            id=f"{self.execution_id}-s{self.step_counter}",
            execution_id=self.execution_id,
            step_number=self.step_counter,
            simulation_time=float(simulation_time),
            module=self.module,
            operation=operation,
            entity=str(entity),
            action=action,
            reason=reason,
            explanation=explanation,
            calculation=calculation or {},
            state_before=state_before or {},
            state_after=state_after or {},
            affected_entities=affected_entities or [],
            next_step=next_step,
            status=status
        )
        self.events.append(event)
        return event

    def get_events(self) -> List[TraceEvent]:
        return self.events

    def get_events_dict(self) -> List[Dict[str, Any]]:
        return [e.model_dump() for e in self.events]
