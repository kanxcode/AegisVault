from typing import List, Dict, Optional
from app.schemas.scheduling import ProcessInput, GanttBlock, SchedulingResult
from app.os_engine.trace_engine import TraceCollector

def build_scheduling_result(
    algorithm: str,
    processes: List[ProcessInput],
    gantt: List[GanttBlock],
    completion_times: Dict[str, int],
    first_responses: Dict[str, int],
    collector: Optional[TraceCollector] = None
) -> SchedulingResult:
    waiting_times = {}
    turnaround_times = {}
    response_times = {}
    
    total_waiting = 0
    total_turnaround = 0
    total_response = 0
    
    for p in processes:
        ct = completion_times.get(p.pid, 0)
        rt = first_responses.get(p.pid, p.arrival_time)
        
        tat = ct - p.arrival_time
        wt = tat - p.burst_time
        resp = rt - p.arrival_time
        
        turnaround_times[p.pid] = tat
        waiting_times[p.pid] = wt
        response_times[p.pid] = resp
        
        total_waiting += wt
        total_turnaround += tat
        total_response += resp
        
    n = len(processes)
    execution_order = [block.pid for block in gantt]
    
    # Optional CPU utilization calculation:
    # Total burst time / total time spanned
    if gantt:
        total_burst = sum(p.burst_time for p in processes)
        total_time = gantt[-1].end - min(p.arrival_time for p in processes)
        cpu_util = (total_burst / total_time) * 100 if total_time > 0 else 100
    else:
        cpu_util = 0
        
    return SchedulingResult(
        algorithm=algorithm,
        gantt=gantt,
        execution_order=execution_order,
        completion_times=completion_times,
        waiting_times=waiting_times,
        turnaround_times=turnaround_times,
        response_times=response_times,
        average_waiting_time=total_waiting / n if n else 0,
        average_turnaround_time=total_turnaround / n if n else 0,
        average_response_time=total_response / n if n else 0,
        cpu_utilization=cpu_util,
        execution_id=collector.execution_id if collector else None,
        trace_events=collector.get_events() if collector else []
    )
