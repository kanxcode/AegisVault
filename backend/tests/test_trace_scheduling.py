import pytest
from app.schemas.scheduling import ProcessInput
from app.os_engine.scheduling.fcfs import schedule_fcfs
from app.os_engine.scheduling.sjf import schedule_sjf
from app.os_engine.scheduling.round_robin import schedule_round_robin
from app.os_engine.scheduling.priority import schedule_priority
from app.os_engine.trace_engine import TraceCollector

def test_fcfs_trace_generation():
    procs = [
        ProcessInput(pid="P1", arrival_time=0, burst_time=4, priority=2),
        ProcessInput(pid="P2", arrival_time=1, burst_time=3, priority=1),
    ]
    collector = TraceCollector(module="cpu_scheduler")
    res = schedule_fcfs(procs, collector=collector)
    
    events = res.trace_events
    assert len(events) >= 3
    assert events[0].operation == "scheduler_init"
    assert events[1].operation == "process_selection"
    assert events[1].entity == "P1"
    assert "calculation" in events[1].model_dump()
    assert events[1].state_before is not None
    assert events[1].state_after is not None

def test_sjf_trace_competitors():
    procs = [
        ProcessInput(pid="P1", arrival_time=0, burst_time=8, priority=1),
        ProcessInput(pid="P2", arrival_time=0, burst_time=4, priority=1),
    ]
    collector = TraceCollector(module="cpu_scheduler")
    res = schedule_sjf(procs, collector=collector)
    
    events = res.trace_events
    # P2 should be selected first because 4 < 8
    p2_event = next(e for e in events if e.operation == "process_selection" and e.entity == "P2")
    assert "shortest burst" in p2_event.reason.lower()
    assert "P1" in p2_event.calculation.get("competitor_comparisons", {})

def test_round_robin_preemption_trace():
    procs = [
        ProcessInput(pid="P1", arrival_time=0, burst_time=6, priority=1),
        ProcessInput(pid="P2", arrival_time=0, burst_time=2, priority=1),
    ]
    collector = TraceCollector(module="cpu_scheduler")
    res = schedule_round_robin(procs, quantum=3, collector=collector)
    
    events = res.trace_events
    # P1 executes 3 units, then preempted
    preempt = next((e for e in events if e.operation == "quantum_preemption"), None)
    assert preempt is not None
    assert preempt.entity == "P1"
    assert preempt.calculation.get("remaining_burst") == 3

def test_priority_trace_convention():
    procs = [
        ProcessInput(pid="P1", arrival_time=0, burst_time=5, priority=3),
        ProcessInput(pid="P2", arrival_time=0, burst_time=5, priority=1),
    ]
    collector = TraceCollector(module="cpu_scheduler")
    res = schedule_priority(procs, collector=collector)
    
    events = res.trace_events
    # P2 has priority 1 < 3, so higher priority
    first_sel = next(e for e in events if e.operation == "process_selection")
    assert first_sel.entity == "P2"
    assert first_sel.calculation.get("selected_priority") == 1
