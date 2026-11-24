from typing import List, Optional
from app.schemas.scheduling import ProcessInput, GanttBlock, SchedulingResult
from app.os_engine.scheduling.utils import build_scheduling_result
from app.os_engine.trace_engine import TraceCollector

def schedule_sjf(processes: List[ProcessInput], collector: Optional[TraceCollector] = None) -> SchedulingResult:
    """Non-preemptive Shortest Job First with complete decision explanations."""
    if collector is None:
        collector = TraceCollector(module="cpu_scheduler")

    pending = sorted(processes, key=lambda p: (p.arrival_time, p.burst_time, p.pid))
    
    current_time = 0
    gantt: List[GanttBlock] = []
    completion_times = {}
    first_responses = {}
    completed = []

    collector.emit(
        simulation_time=0,
        operation="scheduler_init",
        entity="SYSTEM",
        action="initialize",
        reason=f"Initialized SJF (Non-preemptive) with {len(processes)} processes.",
        explanation="Shortest Job First prioritizes available processes with the lowest CPU burst time to minimize average waiting time.",
        calculation={"total_processes": len(processes), "candidates": [f"{p.pid}(burst={p.burst_time})" for p in pending]},
        state_before={"ready_queue": [], "running": None, "completed": []},
        state_after={"ready_queue": [p.pid for p in pending], "running": None, "completed": []},
        affected_entities=[p.pid for p in pending],
        next_step="Evaluate available processes at simulation time 0"
    )

    while pending:
        available = [p for p in pending if p.arrival_time <= current_time]
        
        if not available:
            next_arrival = pending[0]
            idle_duration = next_arrival.arrival_time - current_time
            collector.emit(
                simulation_time=current_time,
                operation="cpu_idle",
                entity="CPU",
                action="wait",
                reason=f"Ready queue is empty. Next process {next_arrival.pid} arrives at {next_arrival.arrival_time} ms.",
                explanation=f"CPU remains idle for {idle_duration} ms until next process arrival.",
                calculation={"idle_start": current_time, "idle_end": next_arrival.arrival_time, "duration": idle_duration},
                state_before={"simulation_time": current_time, "cpu_status": "IDLE"},
                state_after={"simulation_time": next_arrival.arrival_time, "cpu_status": "IDLE"},
                affected_entities=["CPU"],
                next_step=f"Advance simulation time to {next_arrival.arrival_time} ms"
            )
            current_time = next_arrival.arrival_time
            available = [p for p in pending if p.arrival_time <= current_time]

        # Select shortest burst time; tiebreak with arrival time, then pid
        selected = min(available, key=lambda p: (p.burst_time, p.arrival_time, p.pid))
        competing = [p for p in available if p.pid != selected.pid]
        
        # Explain why competitors were not chosen
        competing_reasons = {}
        for c in competing:
            competing_reasons[c.pid] = f"Burst {c.burst_time}ms > selected {selected.burst_time}ms"

        start_time = current_time
        first_responses[selected.pid] = start_time
        pending.remove(selected)

        collector.emit(
            simulation_time=start_time,
            operation="process_selection",
            entity=selected.pid,
            action="selected",
            reason=f"{selected.pid} has shortest burst ({selected.burst_time} ms) among {len(available)} available candidates.",
            explanation=(
                f"SJF selection rule: min(burst_time) for arrived processes. "
                f"Selected {selected.pid} (burst={selected.burst_time}ms). "
                + (f"Competitors rejected: {competing_reasons}" if competing else "No competing candidates.")
            ),
            calculation={
                "selected_burst": selected.burst_time,
                "available_candidates": [f"{p.pid}:{p.burst_time}ms" for p in available],
                "competitor_comparisons": competing_reasons,
                "waiting_time_so_far": start_time - selected.arrival_time
            },
            state_before={
                "simulation_time": start_time,
                "available": [p.pid for p in available],
                "running": None,
                "completed": list(completed)
            },
            state_after={
                "simulation_time": start_time,
                "running": selected.pid,
                "ready_queue": [p.pid for p in pending if p.arrival_time <= start_time],
                "completed": list(completed)
            },
            affected_entities=[selected.pid] + [c.pid for c in competing],
            next_step=f"Run {selected.pid} to completion ({selected.burst_time} ms)"
        )

        current_time += selected.burst_time
        completion_times[selected.pid] = current_time
        completed.append(selected.pid)

        tat = current_time - selected.arrival_time
        wt = tat - selected.burst_time
        rt = start_time - selected.arrival_time

        gantt.append(GanttBlock(
            pid=selected.pid,
            start=start_time,
            end=current_time,
            duration=selected.burst_time
        ))

        collector.emit(
            simulation_time=current_time,
            operation="process_completion",
            entity=selected.pid,
            action="completed",
            reason=f"{selected.pid} completed execution in non-preemptive SJF.",
            explanation=(
                f"Turnaround Time = {current_time} - {selected.arrival_time} = {tat} ms. "
                f"Waiting Time = {tat} - {selected.burst_time} = {wt} ms. "
                f"Response Time = {start_time} - {selected.arrival_time} = {rt} ms."
            ),
            calculation={
                "completion_time": current_time,
                "arrival_time": selected.arrival_time,
                "burst_time": selected.burst_time,
                "turnaround_time": tat,
                "waiting_time": wt,
                "response_time": rt
            },
            state_before={"running": selected.pid, "completed": completed[:-1]},
            state_after={"running": None, "completed": list(completed)},
            affected_entities=[selected.pid],
            next_step="Inspect ready queue for next shortest burst" if pending else "Simulation complete"
        )

    return build_scheduling_result("SJF", processes, gantt, completion_times, first_responses, collector=collector)
