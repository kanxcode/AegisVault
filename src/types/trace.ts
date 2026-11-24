export interface TraceEvent {
  id: string;
  execution_id: string;
  step_number: number;
  simulation_time: number;
  module: string;
  operation: string;
  entity: string;
  action: string;
  reason: string;
  explanation: string;
  calculation: Record<string, any>;
  state_before: Record<string, any>;
  state_after: Record<string, any>;
  affected_entities: string[];
  next_step: string;
  status: 'SUCCESS' | 'FAULT' | 'REJECTED' | 'ABORTED' | 'ERROR' | string;
}

export interface ExecutionRecordResponse {
  execution_id: string;
  module: string;
  algorithm: string;
  status: string;
  total_steps: number;
  final_simulation_time: number;
  input_params: Record<string, any>;
  summary_metrics: Record<string, any>;
  trace_events: TraceEvent[];
  created_at: string;
}

export interface ExecutionHistoryItem {
  execution_id: string;
  module: string;
  algorithm: string;
  status: string;
  total_steps: number;
  created_at: string;
  summary_metrics: Record<string, any>;
}

export interface CpuComparisonData {
  module: string;
  comparison_table: {
    algorithm: string;
    average_waiting_time: number;
    average_turnaround_time: number;
    average_response_time: number;
    cpu_utilization: number;
    execution_order: string[];
    makespan: number;
    context_switches: number;
  }[];
  best_waiting_algorithm: string;
  best_response_algorithm: string;
  tradeoff_analysis: string;
  results: Record<string, any>;
}

export interface MemoryComparisonData {
  module: string;
  comparison_table: {
    algorithm: string;
    allocated_memory: number;
    free_memory: number;
    fragmentation: number;
    successful_allocations: number;
    unallocated_count: number;
    unallocated_pids: string[];
    remaining_blocks_count: number;
  }[];
  tradeoff_analysis: string;
  results: Record<string, any>;
}

export interface DiskComparisonData {
  module: string;
  comparison_table: {
    algorithm: string;
    total_head_movement: number;
    average_seek_distance: number;
    service_order: number[];
    head_path_length: number;
  }[];
  best_movement_algorithm: string;
  tradeoff_analysis: string;
  results: Record<string, any>;
}
