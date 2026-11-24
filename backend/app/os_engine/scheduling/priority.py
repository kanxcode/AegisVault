from typing import List, Optional
from app.schemas.scheduling import ProcessInput, GanttBlock, SchedulingResult
from app.os_engine.scheduling.utils import build_scheduling_result
from app.os_engine.trace_engine import TraceCollector

def schedule_priority(processes: List[ProcessInput], collector: Optional[TraceCollector] = None) -> SchedulingResult:
    """Non-preemptive Priority Scheduling. LOWER number = HIGHER priority (e.g. priority 0 > priority 1)."""
    if collector is None:
        collector = TraceCollector(module="cpu_scheduler")

    pending = sorted(processes, key=lambda p: (p.arrival_time, p.priority, p.pid))
    
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
        reason=f"Initialized Priority Scheduling (Non-preemptive) with {len(processes)} processes.",
        explanation="Priority Scheduling selects the ready process with highest priority. In this system, LOWER number = HIGHER priority (e.g. 1 is higher priority than 2).",
        calculation={"total_processes": len(processes), "priority_ranks": [f"{p.pid}(pri={p.priority})" for p in pending]},
        state_before={"ready_queue": [], "running": None, "completed": []},
        state_after={"ready_queue": [p.pid for p in pending], "running": None, "completed": []},
        affected_entities=[p.pid for p in pending],
        next_step="Inspect processes ready at current simulation time"
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
                reason=f"No process arrived yet. Advancing CPU clock by {idle_duration} ms to next arrival {next_arrival.pid} at {next_arrival.arrival_time} ms.",
                explanation=f"CPU stays idle for {idle_duration} ms.",
                calculation={"idle_start": current_time, "idle_end": next_arrival.arrival_time, "duration": idle_duration},
                state_before={"simulation_time": current_time, "cpu_status": "IDLE"},
                state_after={"simulation_time": next_arrival.arrival_time, "cpu_status": "IDLE"},
                affected_entities=["CPU"],
                next_step=f"Advance to {next_arrival.arrival_time} ms"
            )
            current_time = next_arrival.arrival_time
            available = [p for p in pending if p.arrival_time <= current_time]

        # Select highest priority (lowest priority number), tiebreak with arrival time
        selected = min(available, key=lambda p: (p.priority, p.arrival_time, p.pid))
        competing = [p for p in available if p.pid != selected.pid]
        
        competing_reasons = {}
        for c in competing:
            if c.priority > selected.priority:
                competing_reasons[c.pid] = f"Priority {c.priority} lower than selected {selected.priority}"
            else:
                competing_reasons[c.pid] = f"Same priority {c.priority}, but arrived at {c.arrival_time}ms (later than {selected.arrival_time}ms)"

        start_time = current_time
        first_responses[selected.pid] = start_time
        pending.remove(selected)

        collector.emit(
            simulation_time=start_time,
            operation="process_selection",
            entity=selected.pid,
            action="selected",
            reason=f"{selected.pid} selected with highest priority level {selected.priority} (lower integer value = higher priority).",
            explanation=(
                f"Priority rule: min(priority_number). Process {selected.pid} has priority {selected.priority}. "
                + (f"Competitors rejected: {competing_reasons}" if competing else "No competing candidates.")
            ),
            calculation={
                "selected_priority": selected.priority,
                "available_candidates": [f"{p.pid}:pri={p.priority}" for p in available],
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
            next_step=f"Execute {selected.pid} non-preemptively for {selected.burst_time} ms"
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
            reason=f"{selected.pid} completed execution in non-preemptive Priority scheduling.",
            explanation=(
                f"Turnaround Time = {current_time} - {selected.arrival_time} = {tat} ms. "
                f"Waiting Time = {tat} - {selected.burst_time} = {wt} ms. "
                f"Response Time = {start_time} - {selected.arrival_time} = {rt} ms."
            ),
            calculation={
                "completion_time": current_time,
                "arrival_time": selected.arrival_time,
                "burst_time": selected.burst_time,
                "priority": selected.priority,
                "turnaround_time": tat,
                "waiting_time": wt,
                "response_time": rt
            },
            state_before={"running": selected.pid, "completed": completed[:-1]},
            state_after={"running": None, "completed": list(completed)},
            affected_entities=[selected.pid],
            next_step="Inspect remaining queue for highest priority process" if pending else "Simulation complete"
        )

    return build_scheduling_result("PRIORITY", processes, gantt, completion_times, first_responses, collector=collector)
