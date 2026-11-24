from typing import List, Dict, Optional
from app.schemas.scheduling import ProcessInput, GanttBlock, SchedulingResult
from app.os_engine.scheduling.utils import build_scheduling_result
from app.os_engine.trace_engine import TraceCollector
from collections import deque

def schedule_round_robin(
    processes: List[ProcessInput], 
    quantum: int, 
    collector: Optional[TraceCollector] = None
) -> SchedulingResult:
    if quantum is None or quantum <= 0:
        raise ValueError("Time quantum must be positive")
        
    if collector is None:
        collector = TraceCollector(module="cpu_scheduler")

    sorted_procs = sorted(processes, key=lambda p: (p.arrival_time, p.pid))
    
    current_time = 0
    gantt: List[GanttBlock] = []
    completion_times: Dict[str, int] = {}
    first_responses: Dict[str, int] = {}
    completed = []
    
    remaining_burst = {p.pid: p.burst_time for p in processes}
    ready_queue = deque()
    
    idx = 0
    n = len(sorted_procs)
    
    collector.emit(
        simulation_time=0,
        operation="scheduler_init",
        entity="SYSTEM",
        action="initialize",
        reason=f"Initialized Round Robin with quantum={quantum} ms and {n} processes.",
        explanation="Round Robin shares CPU cyclically among ready processes using a fixed time quantum.",
        calculation={"quantum": quantum, "total_processes": n},
        state_before={"ready_queue": [], "running": None, "completed": []},
        state_after={"ready_queue": [], "running": None, "completed": []},
        affected_entities=[p.pid for p in sorted_procs],
        next_step="Enqueue arriving processes at simulation start"
    )

    if n > 0:
        current_time = sorted_procs[0].arrival_time
        ready_queue.append(sorted_procs[idx])
        collector.emit(
            simulation_time=current_time,
            operation="process_arrival",
            entity=sorted_procs[idx].pid,
            action="enqueued",
            reason=f"{sorted_procs[idx].pid} arrived at time {current_time} ms and entered ready queue.",
            explanation="Processes entering the ready queue are placed at the tail.",
            calculation={"arrival_time": current_time, "burst_time": sorted_procs[idx].burst_time},
            state_before={"ready_queue": []},
            state_after={"ready_queue": [p.pid for p in ready_queue]},
            affected_entities=[sorted_procs[idx].pid],
            next_step=f"Dispatch head of queue ({sorted_procs[idx].pid})"
        )
        idx += 1
        
    while ready_queue or idx < n:
        if not ready_queue:
            next_proc = sorted_procs[idx]
            idle_duration = next_proc.arrival_time - current_time
            collector.emit(
                simulation_time=current_time,
                operation="cpu_idle",
                entity="CPU",
                action="wait",
                reason=f"No process in ready queue. Advancing CPU clock to next arrival {next_proc.pid} at {next_proc.arrival_time} ms.",
                explanation=f"CPU stays idle for {idle_duration} ms.",
                calculation={"idle_start": current_time, "idle_end": next_proc.arrival_time, "duration": idle_duration},
                state_before={"simulation_time": current_time, "cpu_status": "IDLE"},
                state_after={"simulation_time": next_proc.arrival_time, "cpu_status": "IDLE"},
                affected_entities=["CPU"],
                next_step=f"Enqueue {next_proc.pid} upon arrival"
            )
            current_time = next_proc.arrival_time
            ready_queue.append(next_proc)
            idx += 1
            
        p = ready_queue.popleft()
        
        is_first_response = p.pid not in first_responses
        if is_first_response:
            first_responses[p.pid] = current_time
            
        start_time = current_time
        rem = remaining_burst[p.pid]
        exec_time = min(quantum, rem)
        current_time += exec_time
        remaining_burst[p.pid] -= exec_time
        
        collector.emit(
            simulation_time=start_time,
            operation="process_selection",
            entity=p.pid,
            action="selected",
            reason=f"{p.pid} was at head of ready queue (remaining burst: {rem} ms, quantum: {quantum} ms).",
            explanation=f"Round Robin dispatches the queue head for up to quantum={quantum} ms or remaining burst ({rem} ms). Executing for {exec_time} ms.",
            calculation={
                "time_quantum": quantum,
                "remaining_burst_before": rem,
                "allocated_duration": exec_time,
                "first_scheduled": is_first_response
            },
            state_before={
                "simulation_time": start_time,
                "running": None,
                "ready_queue": [q.pid for q in ready_queue]
            },
            state_after={
                "simulation_time": start_time,
                "running": p.pid,
                "ready_queue": [q.pid for q in ready_queue]
            },
            affected_entities=[p.pid],
            next_step=f"Execute {p.pid} for {exec_time} ms"
        )
        
        gantt.append(GanttBlock(
            pid=p.pid,
            start=start_time,
            end=current_time,
            duration=exec_time
        ))
        
        # Add newly arrived processes to queue before re-queueing current process
        newly_arrived = []
        while idx < n and sorted_procs[idx].arrival_time <= current_time:
            ready_queue.append(sorted_procs[idx])
            newly_arrived.append(sorted_procs[idx].pid)
            idx += 1
            
        if newly_arrived:
            collector.emit(
                simulation_time=current_time,
                operation="process_arrival",
                entity=",".join(newly_arrived),
                action="enqueued",
                reason=f"Processes {newly_arrived} arrived during {p.pid}'s execution slice and were added to ready queue.",
                explanation="Newly arrived processes are queued before any preempted process is rotated back to queue tail.",
                calculation={"arrived_count": len(newly_arrived), "pids": newly_arrived},
                state_before={},
                state_after={"ready_queue": [q.pid for q in ready_queue]},
                affected_entities=newly_arrived,
                next_step="Check if running process completed or requires rotation"
            )
            
        if remaining_burst[p.pid] > 0:
            ready_queue.append(p)
            collector.emit(
                simulation_time=current_time,
                operation="quantum_preemption",
                entity=p.pid,
                action="preempted",
                reason=f"Time quantum ({quantum} ms) expired. {p.pid} has {remaining_burst[p.pid]} ms remaining burst.",
                explanation="Round Robin preempts the process and moves it to the rear of the ready queue.",
                calculation={
                    "quantum": quantum,
                    "remaining_burst": remaining_burst[p.pid],
                    "new_queue_position": len(ready_queue)
                },
                state_before={"running": p.pid},
                state_after={"running": None, "ready_queue": [q.pid for q in ready_queue]},
                affected_entities=[p.pid],
                next_step=f"Ready next process in queue: {ready_queue[0].pid if ready_queue else 'None'}"
            )
        else:
            completion_times[p.pid] = current_time
            completed.append(p.pid)
            tat = current_time - p.arrival_time
            wt = tat - p.burst_time
            rt = first_responses[p.pid] - p.arrival_time
            collector.emit(
                simulation_time=current_time,
                operation="process_completion",
                entity=p.pid,
                action="completed",
                reason=f"{p.pid} finished full burst ({p.burst_time} ms) at time {current_time} ms.",
                explanation=(
                    f"Turnaround = {current_time} - {p.arrival_time} = {tat} ms. "
                    f"Waiting = {tat} - {p.burst_time} = {wt} ms. "
                    f"Response = {first_responses[p.pid]} - {p.arrival_time} = {rt} ms."
                ),
                calculation={
                    "completion_time": current_time,
                    "arrival_time": p.arrival_time,
                    "burst_time": p.burst_time,
                    "turnaround_time": tat,
                    "waiting_time": wt,
                    "response_time": rt
                },
                state_before={"running": p.pid, "completed": completed[:-1]},
                state_after={"running": None, "completed": list(completed)},
                affected_entities=[p.pid],
                next_step=f"Dispatch next process from ready queue: {ready_queue[0].pid if ready_queue else 'None'}"
            )
            
    return build_scheduling_result("ROUND_ROBIN", processes, gantt, completion_times, first_responses, collector=collector)
