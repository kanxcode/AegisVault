from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from datetime import datetime
import random

from app.database.connection import get_db
from app.models.simulation import TransactionModel, LockModel, SystemEvent, ExecutionModel
from app.schemas.transaction import (
    TransactionCreate, TransactionResponse, LockResponse,
    DeadlockSimulationResponse, DeadlockNode
)
from app.os_engine.trace_engine import TraceCollector

router = APIRouter()

@router.get("/", response_model=List[TransactionResponse])
def get_transactions(
    status: Optional[str] = Query(None, description="Filter by status (ACTIVE, COMMITTED, ROLLED_BACK)"),
    search: Optional[str] = Query(None, description="Search by TX ID"),
    db: Session = Depends(get_db)
):
    q = db.query(TransactionModel)
    if status and status.upper() != "ALL":
        q = q.filter(TransactionModel.status == status.upper())
    if search:
        q = q.filter(TransactionModel.id.ilike(f"%{search}%"))
        
    txs = q.order_by(TransactionModel.created_at.desc()).all()
    return [
        TransactionResponse(
            id=t.id,
            status=t.status,
            query=t.query,
            duration_ms=t.duration_ms,
            created_at=t.created_at.strftime("%H:%M:%S")
        )
        for t in txs
    ]

@router.post("/begin", response_model=TransactionResponse)
def begin_transaction(tx_in: TransactionCreate, db: Session = Depends(get_db)):
    tx_id = f"TX-{random.randint(10000, 99999)}"
    collector = TraceCollector(module="transactions", execution_id=f"exec-{tx_id.lower()}")
    
    # 1. Start TX & Explain Atomicity
    collector.emit(
        simulation_time=0.1,
        operation="tx_begin",
        entity=tx_id,
        action="begin",
        reason=f"Started transaction {tx_id}. Established ACID transaction boundary.",
        explanation=(
            "ACID Atomicity guarantee: All modifications within this transaction will either commit entirely "
            "or be rolled back without partial execution. Isolation boundary prevents dirty reads by other transactions."
        ),
        calculation={"tx_id": tx_id, "isolation_level": "READ_COMMITTED"},
        state_before={"tx_status": "NONE"},
        state_after={"tx_status": "ACTIVE", "tx_id": tx_id},
        affected_entities=[tx_id],
        next_step="Acquire resource locks"
    )

    # 2. Acquire lock based on query table
    resource = "users_tbl"
    if "session" in tx_in.query.lower():
        resource = "sessions_tbl"
    elif "audit" in tx_in.query.lower():
        resource = "audit_logs_tbl"
    elif "config" in tx_in.query.lower():
        resource = "system_config_tbl"

    lock_type = "EXCLUSIVE" if any(w in tx_in.query.upper() for w in ["UPDATE", "INSERT", "DELETE"]) else "SHARED"
    
    collector.emit(
        simulation_time=0.2,
        operation="lock_acquisition",
        entity=resource,
        action=f"acquire_{lock_type.lower()}_lock",
        reason=f"Transaction {tx_id} requested {lock_type} lock on {resource} for query execution.",
        explanation=(
            f"Isolation control: {lock_type} lock acquired on table {resource}. "
            + ("Exclusive lock prevents concurrent writes and dirty reads." if lock_type == "EXCLUSIVE" else "Shared lock allows concurrent readers but blocks exclusive modifiers.")
        ),
        calculation={"resource": resource, "lock_type": lock_type, "holder": tx_id},
        state_before={"held_locks": []},
        state_after={"held_locks": [f"{resource}:{lock_type}"]},
        affected_entities=[resource, tx_id],
        next_step="Execute transaction statement"
    )

    lock = LockModel(
        tx_id=tx_id,
        resource=resource,
        lock_type=lock_type
    )
    db.add(lock)

    # 3. Simulate statement execution
    new_tx = TransactionModel(
        id=tx_id,
        status="ACTIVE",
        query=tx_in.query,
        duration_ms=random.randint(5, 50),
        created_at=datetime.utcnow()
    )
    db.add(new_tx)

    collector.emit(
        simulation_time=0.3,
        operation="statement_execution",
        entity=tx_id,
        action="execute_statement",
        reason=f"Executed transaction statement under active lock: '{tx_in.query[:50]}...'.",
        explanation="Consistency validation: Constraints and schema types verified. Changes buffered in write-ahead log pending COMMIT or ROLLBACK.",
        calculation={"query": tx_in.query, "resource": resource, "lock_type": lock_type},
        state_before={"tx_status": "ACTIVE"},
        state_after={"tx_status": "ACTIVE", "uncommitted_changes": True},
        affected_entities=[tx_id, resource],
        next_step="Await explicit COMMIT or ROLLBACK"
    )

    execution_record = ExecutionModel(
        id=collector.execution_id,
        module="transactions",
        algorithm="TX_LIFECYCLE",
        status="ACTIVE",
        input_data={"tx_id": tx_id, "query": tx_in.query},
        result_data={"tx_id": tx_id, "status": "ACTIVE", "resource": resource, "lock_type": lock_type},
        summary_metrics={"tx_id": tx_id, "lock_type": lock_type},
        trace_events=collector.get_events_dict(),
        total_steps=len(collector.get_events())
    )
    db.add(execution_record)

    event = SystemEvent(
        module="DB",
        event="TX_BEGIN",
        severity="INFO",
        description=f"Transaction {tx_id} started. Acquired {lock_type} lock on {resource} (Exec ID: {collector.execution_id})."
    )
    db.add(event)
    db.commit()
    db.refresh(new_tx)

    resp = TransactionResponse(
        id=new_tx.id,
        status=new_tx.status,
        query=new_tx.query,
        duration_ms=new_tx.duration_ms,
        created_at=new_tx.created_at.strftime("%H:%M:%S"),
        acid_stage="ACTIVE (Uncommitted buffer in WAL)",
        acid_explanation="Atomicity & Isolation active. Modifications isolated until commit.",
        execution_id=collector.execution_id,
        trace_events=collector.get_events()
    )
    return resp

@router.post("/{tx_id}/commit", response_model=TransactionResponse)
def commit_transaction(tx_id: str, db: Session = Depends(get_db)):
    tx = db.query(TransactionModel).filter(TransactionModel.id == tx_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail=f"Transaction {tx_id} not found")

    collector = TraceCollector(module="transactions", execution_id=f"exec-{tx_id.lower()}-commit")
    
    # Check held locks before release
    held_locks = db.query(LockModel).filter(LockModel.tx_id == tx_id).all()
    lock_descriptions = [f"{l.resource} ({l.lock_type})" for l in held_locks]

    collector.emit(
        simulation_time=1.0,
        operation="tx_commit",
        entity=tx_id,
        action="commit",
        reason=f"Transaction {tx_id} committed successfully. Data changes permanently written to WAL.",
        explanation=(
            "ACID Durability guarantee: All buffered modifications are flushed to non-volatile storage (WAL/Data pages). "
            "Changes are now permanent and will survive system crash or restart."
        ),
        calculation={"tx_id": tx_id, "status": "COMMITTED"},
        state_before={"status": "ACTIVE"},
        state_after={"status": "COMMITTED"},
        affected_entities=[tx_id],
        next_step="Release all locks held by transaction"
    )

    collector.emit(
        simulation_time=2.0,
        operation="lock_release",
        entity=tx_id,
        action="release_all_locks",
        reason=f"Released all {len(held_locks)} locks held by {tx_id}: {lock_descriptions}.",
        explanation="Strict Two-Phase Locking (2PL): All locks held by the transaction are released simultaneously upon commit.",
        calculation={"released_locks": lock_descriptions},
        state_before={"locks_held": lock_descriptions},
        state_after={"locks_held": []},
        affected_entities=[tx_id] + [l.resource for l in held_locks],
        next_step="Transaction lifecycle complete"
    )

    tx.status = "COMMITTED"
    tx.duration_ms += random.randint(5, 20)
    db.query(LockModel).filter(LockModel.tx_id == tx_id).delete()

    execution_record = ExecutionModel(
        id=collector.execution_id,
        module="transactions",
        algorithm="TX_COMMIT",
        status="COMMITTED",
        input_data={"tx_id": tx_id},
        result_data={"tx_id": tx_id, "status": "COMMITTED"},
        summary_metrics={"tx_id": tx_id, "locks_released": len(held_locks)},
        trace_events=collector.get_events_dict(),
        total_steps=len(collector.get_events())
    )
    db.add(execution_record)

    event = SystemEvent(
        module="DB",
        event="TX_COMMIT",
        severity="INFO",
        description=f"Transaction {tx_id} committed successfully. All locks released (Exec ID: {collector.execution_id})."
    )
    db.add(event)
    db.commit()
    db.refresh(tx)

    return TransactionResponse(
        id=tx.id,
        status=tx.status,
        query=tx.query,
        duration_ms=tx.duration_ms,
        created_at=tx.created_at.strftime("%H:%M:%S"),
        acid_stage="COMMITTED (Durability guaranteed)",
        acid_explanation="Flushed to disk. Strict 2PL locks released.",
        execution_id=collector.execution_id,
        trace_events=collector.get_events()
    )

@router.post("/{tx_id}/rollback", response_model=TransactionResponse)
def rollback_transaction(tx_id: str, db: Session = Depends(get_db)):
    tx = db.query(TransactionModel).filter(TransactionModel.id == tx_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail=f"Transaction {tx_id} not found")

    collector = TraceCollector(module="transactions", execution_id=f"exec-{tx_id.lower()}-rollback")
    
    held_locks = db.query(LockModel).filter(LockModel.tx_id == tx_id).all()
    lock_descriptions = [f"{l.resource} ({l.lock_type})" for l in held_locks]

    collector.emit(
        simulation_time=1.0,
        operation="tx_rollback",
        entity=tx_id,
        action="rollback",
        reason=f"Transaction {tx_id} rolled back. All uncommitted changes undone using undo-log records.",
        explanation=(
            "ACID Atomicity guarantee: Intermediate state changes were aborted. System state restored to pre-transaction snapshot. "
            "Zero uncommitted modifications remain."
        ),
        calculation={"tx_id": tx_id, "status": "ROLLED_BACK"},
        state_before={"status": "ACTIVE"},
        state_after={"status": "ROLLED_BACK"},
        affected_entities=[tx_id],
        status="ABORTED",
        next_step="Release all locks held by transaction"
    )

    collector.emit(
        simulation_time=2.0,
        operation="lock_release",
        entity=tx_id,
        action="release_all_locks",
        reason=f"Released all {len(held_locks)} locks held by aborted {tx_id}: {lock_descriptions}.",
        explanation="Strict Two-Phase Locking: Locks released upon rollback, allowing waiting transactions to proceed.",
        calculation={"released_locks": lock_descriptions},
        state_before={"locks_held": lock_descriptions},
        state_after={"locks_held": []},
        affected_entities=[tx_id] + [l.resource for l in held_locks],
        next_step="Transaction aborted cleanly"
    )

    tx.status = "ROLLED_BACK"
    db.query(LockModel).filter(LockModel.tx_id == tx_id).delete()

    execution_record = ExecutionModel(
        id=collector.execution_id,
        module="transactions",
        algorithm="TX_ROLLBACK",
        status="ROLLED_BACK",
        input_data={"tx_id": tx_id},
        result_data={"tx_id": tx_id, "status": "ROLLED_BACK"},
        summary_metrics={"tx_id": tx_id, "locks_released": len(held_locks)},
        trace_events=collector.get_events_dict(),
        total_steps=len(collector.get_events())
    )
    db.add(execution_record)

    event = SystemEvent(
        module="DB",
        event="TX_ROLLBACK",
        severity="WARNING",
        description=f"Transaction {tx_id} rolled back. State restored, locks released (Exec ID: {collector.execution_id})."
    )
    db.add(event)
    db.commit()
    db.refresh(tx)

    return TransactionResponse(
        id=tx.id,
        status=tx.status,
        query=tx.query,
        duration_ms=tx.duration_ms,
        created_at=tx.created_at.strftime("%H:%M:%S"),
        acid_stage="ROLLED_BACK (Atomicity preserved)",
        acid_explanation="Uncommitted modifications reverted. Locks released.",
        execution_id=collector.execution_id,
        trace_events=collector.get_events()
    )

@router.get("/locks", response_model=List[LockResponse])
def get_locks(db: Session = Depends(get_db)):
    locks = db.query(LockModel).all()
    return locks

@router.post("/deadlock/simulate", response_model=DeadlockSimulationResponse)
def simulate_deadlock(trigger: bool = Query(False, description="Whether to induce a simulated deadlock"), db: Session = Depends(get_db)):
    collector = TraceCollector(module="transactions", execution_id="exec-deadlock-detection")
    
    if trigger:
        graph = [
            DeadlockNode(tx_id="TX-00824", waiting_for="TX-00825", resource="users_tbl (ROW #42)"),
            DeadlockNode(tx_id="TX-00825", waiting_for="TX-00824", resource="audit_logs_tbl (ROW #12)")
        ]
        
        collector.emit(
            simulation_time=1.0,
            operation="wait_for_graph_scan",
            entity="WAIT_FOR_GRAPH",
            action="detect_cycle",
            reason="Wait-For Graph cycle detector identified circular dependency: TX-00824 -> TX-00825 -> TX-00824.",
            explanation="A directed cycle in the transaction Wait-For Graph confirms a deadlock: neither transaction can proceed until the other releases its lock.",
            calculation={"cycle": ["TX-00824", "TX-00825", "TX-00824"], "deadlock": True},
            state_before={"graph_status": "SEARCHING"},
            state_after={"graph_status": "DEADLOCK_DETECTED"},
            affected_entities=["TX-00824", "TX-00825"],
            status="FAULT",
            next_step="Select victim transaction for rollback"
        )

        collector.emit(
            simulation_time=2.0,
            operation="deadlock_resolution",
            entity="TX-00825",
            action="abort_victim",
            reason="Victim selected: TX-00825 chosen based on lowest rollback cost.",
            explanation="Deadlock recovery: Aborting TX-00825 breaks the Wait-For cycle. Its locks are released, allowing TX-00824 to proceed.",
            calculation={"victim": "TX-00825", "cost_metric": "fewest_updates_made"},
            state_before={"deadlock_active": True},
            state_after={"deadlock_active": False, "victim_aborted": "TX-00825"},
            affected_entities=["TX-00825"],
            next_step="Cycle resolved"
        )

        event = SystemEvent(
            module="DB",
            event="DEADLOCK_DETECTED",
            severity="ERROR",
            description=f"Deadlock cycle detected between TX-00824 and TX-00825 on users_tbl and audit_logs_tbl [Exec ID: {collector.execution_id}]."
        )
        db.add(event)
        db.commit()

        return DeadlockSimulationResponse(
            deadlock_detected=True,
            cycle=["TX-00824", "TX-00825", "TX-00824"],
            wait_for_graph=graph,
            resolution_action="Victim selected: TX-00825 aborted and rolled back to break cycle.",
            message="Deadlock condition verified by Wait-For Graph cycle detector.",
            execution_id=collector.execution_id,
            trace_events=collector.get_events()
        )
    else:
        collector.emit(
            simulation_time=1.0,
            operation="wait_for_graph_scan",
            entity="WAIT_FOR_GRAPH",
            action="acyclic_verified",
            reason="Wait-For Graph scan completed. No directed cycles found.",
            explanation="The resource wait graph is an acyclic directed graph (DAG). No deadlock exists.",
            calculation={"cycle_detected": False, "nodes": 0},
            state_before={"graph_status": "SEARCHING"},
            state_after={"graph_status": "ACYCLIC"},
            affected_entities=["WAIT_FOR_GRAPH"],
            next_step="Continue routine lock monitoring"
        )
        return DeadlockSimulationResponse(
            deadlock_detected=False,
            cycle=[],
            wait_for_graph=[],
            resolution_action=None,
            message="No deadlocks detected. Wait-For Graph is acyclic (Cycle latency: 250ms).",
            execution_id=collector.execution_id,
            trace_events=collector.get_events()
        )
