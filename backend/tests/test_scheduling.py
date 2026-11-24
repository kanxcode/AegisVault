import pytest
from app.schemas.scheduling import ProcessInput
from app.os_engine.scheduling.fcfs import schedule_fcfs
from app.os_engine.scheduling.sjf import schedule_sjf
from app.os_engine.scheduling.round_robin import schedule_round_robin
from app.os_engine.scheduling.priority import schedule_priority

@pytest.fixture
def sample_processes():
    return [
        ProcessInput(pid="P1", arrival_time=0, burst_time=8, priority=2),
        ProcessInput(pid="P2", arrival_time=1, burst_time=4, priority=1),
        ProcessInput(pid="P3", arrival_time=2, burst_time=9, priority=3),
        ProcessInput(pid="P4", arrival_time=3, burst_time=5, priority=4)
    ]

def test_fcfs_scheduling(sample_processes):
    result = schedule_fcfs(sample_processes)
    assert result.algorithm == "FCFS"
    assert len(result.gantt) == 4
    assert result.gantt[0].pid == "P1"
    assert result.gantt[0].start == 0
    assert result.gantt[0].end == 8
    
    assert result.completion_times["P1"] == 8
    assert result.completion_times["P2"] == 12
    
    assert result.waiting_times["P1"] == 0
    assert result.waiting_times["P2"] == 7 # Start(8) - Arrival(1) = 7

def test_sjf_scheduling(sample_processes):
    result = schedule_sjf(sample_processes)
    assert result.algorithm == "SJF"
    assert len(result.gantt) == 4
    
    # At t=0, P1 is available. It runs for 8. (0 to 8)
    # At t=8, P2(4), P3(9), P4(5) are available.
    # Next is P2 (burst 4). (8 to 12)
    # Next is P4 (burst 5). (12 to 17)
    # Next is P3 (burst 9). (17 to 26)
    assert result.gantt[0].pid == "P1"
    assert result.gantt[1].pid == "P2"
    assert result.gantt[2].pid == "P4"
    assert result.gantt[3].pid == "P3"
    
def test_round_robin_scheduling(sample_processes):
    result = schedule_round_robin(sample_processes, quantum=4)
    assert result.algorithm == "ROUND_ROBIN"
    # P1 (0-4), P2 (4-8), P3 (8-12), P4 (12-16), P1 (16-20), P3 (20-24), P4 (24-25), P3 (25-26)
    assert result.gantt[0].pid == "P1"
    assert result.gantt[0].duration == 4
    assert result.gantt[1].pid == "P2"
    assert result.gantt[1].duration == 4
    
def test_priority_scheduling(sample_processes):
    result = schedule_priority(sample_processes)
    assert result.algorithm == "PRIORITY"
    # P1 arrives at 0. Runs until 8.
    # At 8, P2(1), P3(3), P4(4) are available. Lower number = higher priority.
    # P2 runs (8-12)
    # P3 runs (12-21)
    # P4 runs (21-26)
    assert result.gantt[0].pid == "P1"
    assert result.gantt[1].pid == "P2"
    assert result.gantt[2].pid == "P3"
    assert result.gantt[3].pid == "P4"
