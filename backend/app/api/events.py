from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from app.database.connection import get_db
from app.models.simulation import SystemEvent
from pydantic import BaseModel, ConfigDict
from typing import List, Optional

router = APIRouter()

class EventCreate(BaseModel):
    module: str
    event: str
    severity: str
    description: str
    execution_id: Optional[str] = None
    step_number: Optional[int] = None
    status: Optional[str] = "SUCCESS"
    entity: Optional[str] = None

class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    module: str
    event: str
    severity: str
    description: str
    timestamp: str
    execution_id: Optional[str] = None
    step_number: Optional[int] = None
    status: Optional[str] = "SUCCESS"
    entity: Optional[str] = None

@router.post("/", response_model=EventResponse)
def create_event(event: EventCreate, db: Session = Depends(get_db)):
    db_event = SystemEvent(
        module=event.module.upper(),
        event=event.event,
        severity=event.severity.upper(),
        description=event.description,
        execution_id=event.execution_id,
        step_number=event.step_number,
        status=event.status or "SUCCESS",
        entity=event.entity
    )
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    
    ts = db_event.timestamp.strftime("%H:%M:%S.%f")[:-3]
    return EventResponse(
        id=db_event.id,
        module=db_event.module,
        event=db_event.event,
        severity=db_event.severity,
        description=db_event.description,
        timestamp=ts,
        execution_id=db_event.execution_id,
        step_number=db_event.step_number,
        status=db_event.status,
        entity=db_event.entity
    )

@router.get("/", response_model=List[EventResponse])
def get_events(
    limit: int = Query(100, le=500),
    severity: Optional[str] = Query(None, description="Filter by severity (INFO, WARNING, ERROR)"),
    module: Optional[str] = Query(None, description="Filter by module (PROC, MEM, CPU, DISK, DB, FS, SYS)"),
    execution_id: Optional[str] = Query(None, description="Filter by execution ID"),
    status: Optional[str] = Query(None, description="Filter by status (SUCCESS, FAULT, REJECTED, ERROR)"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    search: Optional[str] = Query(None, description="Search in event or description"),
    db: Session = Depends(get_db)
):
    q = db.query(SystemEvent)
    if severity and severity.upper() != "ALL":
        q = q.filter(SystemEvent.severity == severity.upper())
    if module and module.upper() != "ALL":
        q = q.filter(SystemEvent.module == module.upper())
    if execution_id:
        q = q.filter(SystemEvent.execution_id == execution_id)
    if status and status.upper() != "ALL":
        q = q.filter(SystemEvent.status == status.upper())
    if event_type:
        q = q.filter(SystemEvent.event.ilike(f"%{event_type}%"))
    if search:
        s = f"%{search}%"
        q = q.filter((SystemEvent.event.ilike(s)) | (SystemEvent.description.ilike(s)) | (SystemEvent.entity.ilike(s)))
        
    events = q.order_by(SystemEvent.timestamp.desc()).limit(limit).all()
    result = []
    for e in events:
        ts = e.timestamp.strftime("%H:%M:%S.%f")[:-3]
        result.append(EventResponse(
            id=e.id,
            module=e.module,
            event=e.event,
            severity=e.severity,
            description=e.description,
            timestamp=ts,
            execution_id=e.execution_id,
            step_number=e.step_number,
            status=e.status,
            entity=e.entity
        ))
    return result

@router.delete("/clear")
def clear_events(db: Session = Depends(get_db)):
    db.query(SystemEvent).delete()
    db.commit()
    return {"status": "ok", "message": "All event logs cleared"}

@router.get("/export")
def export_events(format: str = Query("csv", pattern="^(csv|json)$"), db: Session = Depends(get_db)):
    events = db.query(SystemEvent).order_by(SystemEvent.timestamp.desc()).limit(1000).all()
    if format == "json":
        import json
        data = [
            {
                "id": e.id,
                "timestamp": e.timestamp.isoformat(),
                "module": e.module,
                "event": e.event,
                "severity": e.severity,
                "description": e.description,
                "execution_id": e.execution_id,
                "step_number": e.step_number,
                "status": e.status,
                "entity": e.entity
            }
            for e in events
        ]
        return Response(content=json.dumps(data, indent=2), media_type="application/json")
    else:
        csv_lines = ["id,timestamp,module,event,severity,description,execution_id,step_number,status,entity"]
        for e in events:
            desc_escaped = f'"{e.description.replace(chr(34), chr(34)+chr(34))}"'
            csv_lines.append(f"{e.id},{e.timestamp.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]},{e.module},{e.event},{e.severity},{desc_escaped},{e.execution_id or ''},{e.step_number or ''},{e.status or ''},{e.entity or ''}")
        csv_content = "\n".join(csv_lines)
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=aegis_event_logs.csv"}
        )
