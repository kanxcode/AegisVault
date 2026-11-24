from typing import List, Optional
from app.schemas.scheduling import ProcessInput, GanttBlock, SchedulingResult
from app.os_engine.scheduling.utils import build_scheduling_result
from app.os_engine.trace_engine import TraceCollector

def schedule_fcfs(processes: List[ProcessInput], collector: Optional[TraceCollector] = None) -> SchedulingResult:
    if collector is None:
        collector = TraceCollector(module="cpu_scheduler")
        
    sorted_procs = sorted(processes, key=lambda p: (p.arrival_time, p.pid))
    
    current_time = 0
    gantt: List[GanttBlock] = []
    completion_times = {}
    first_responses = {}
    completed = []
    
    # Initial admission trace event
    collector.emit(
        simulation_time=0,
        operation="scheduler_init",
        entity="SYSTEM",
        action="initialize",
        reason=f"Initialized FCFS scheduler with {len(processes)} processes in arrival order.",
        explanation="First-Come First-Served executes processes in strict arrival sequence without preemption.",
        calculation={"total_processes": len(processes), "arrival_order": [p.pid for p in sorted_procs]},
        state_before={"ready_queue": [], "running": None, "completed": []},
        state_after={"ready_queue": [p.pid for p in sorted_procs], "running": None, "completed": []},
        affected_entities=[p.pid for p in sorted_procs],
        next_step=f"Dispatch first arriving process {sorted_procs[0].pid if sorted_procs else 'None'}"
    )

    for i, p in enumerate(sorted_procs):
        # Idle time handling
        if current_time < p.arrival_time:
            idle_duration = p.arrival_time - current_time
            collector.emit(
                simulation_time=current_time,
                operation="cpu_idle",
                entity="CPU",
                action="wait",
                reason=f"No process ready in queue. Next arrival is {p.pid} at time {p.arrival_time} ms.",
                explanation=f"CPU stays idle for {idle_duration} ms until next arrival.",
                calculation={"idle_start": current_time, "idle_end": p.arrival_time, "duration": idle_duration},
                state_before={"simulation_time": current_time, "cpu_status": "IDLE"},
                state_after={"simulation_time": p.arrival_time, "cpu_status": "IDLE"},
                affected_entities=["CPU"],
                next_step=f"Dispatch {p.pid} at arrival time {p.arrival_time} ms"
            )
            current_time = p.arrival_time

        start_time = current_time
        first_responses[p.pid] = start_time
        wait_so_far = start_time - p.arrival_time
        remaining_queue = [q.pid for q in sorted_procs[i+1:]]

        # Process dispatch event
        collector.emit(
            simulation_time=start_time,
            operation="process_selection",
            entity=p.pid,
            action="selected",
            reason=f"{p.pid} arrived earliest at time {p.arrival_time} ms (wait time: {wait_so_far} ms).",
            explanation="FCFS selects the head of the arrival queue. No priority or burst length adjustments apply.",
            calculation={
                "arrival_time": p.arrival_time,
                "start_time": start_time,
                "burst_time": p.burst_time,
                "waiting_time_so_far": wait_so_far
            },
            state_before={
                "simulation_time": start_time,
                "running": None,
                "ready_queue": [p.pid] + remaining_queue,
                "completed": list(completed)
            },
            state_after={
                "simulation_time": start_time,
                "running": p.pid,
                "ready_queue": remaining_queue,
                "completed": list(completed)
            },
            affected_entities=[p.pid],
            next_step=f"Execute {p.pid} on CPU for {p.burst_time} ms (completion at {start_time + p.burst_time} ms)"
        )

        current_time += p.burst_time
        completion_times[p.pid] = current_time
        completed.append(p.pid)
        
        tat = current_time - p.arrival_time
        wt = tat - p.burst_time
        rt = start_time - p.arrival_time

        gantt.append(GanttBlock(
            pid=p.pid,
            start=start_time,
            end=current_time,
            duration=p.burst_time
        ))

        next_proc = sorted_procs[i+1].pid if i + 1 < len(sorted_procs) else "None"
        collector.emit(
            simulation_time=current_time,
            operation="process_completion",
            entity=p.pid,
            action="completed",
            reason=f"{p.pid} finished full burst requirement of {p.burst_time} ms.",
            explanation=(
                f"Metrics computed: Turnaround Time = Completion Time ({current_time}) - Arrival ({p.arrival_time}) = {tat} ms. "
                f"Waiting Time = Turnaround ({tat}) - Burst ({p.burst_time}) = {wt} ms. "
                f"Response Time = Start ({start_time}) - Arrival ({p.arrival_time}) = {rt} ms."
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
            next_step=f"Dispatch next process {next_proc}" if next_proc != "None" else "Simulation complete"
        )

    return build_scheduling_result("FCFS", processes, gantt, completion_times, first_responses, collector=collector)
