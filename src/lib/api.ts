const API_BASE = "http://localhost:8000/api";

export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    let errorMsg = `HTTP Error ${res.status}`;
    try {
      const err = await res.json();
      if (err.detail) errorMsg = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }
  return res.json();
}

export const api = {
  // Processes
  getProcesses: (state?: string, search?: string) => {
    const params = new URLSearchParams();
    if (state && state !== "ALL") params.append("state", state);
    if (search) params.append("search", search);
    return fetchJson<any[]>(`/processes/?${params.toString()}`);
  },
  createProcess: (data: { pid: string; name: string; state?: string; burst_time: number; priority: number; memory: number }) =>
    fetchJson<any>("/processes/", { method: "POST", body: JSON.stringify(data) }),
  updateProcessState: (pid: string, state: string) =>
    fetchJson<any>(`/processes/${pid}/state`, { method: "PATCH", body: JSON.stringify({ state }) }),
  deleteProcess: (pid: string) =>
    fetchJson<any>(`/processes/${pid}`, { method: "DELETE" }),
  resetProcesses: () =>
    fetchJson<any[]>("/processes/reset", { method: "POST" }),

  // Scheduling
  runScheduler: (data: { algorithm: string; quantum?: number; processes: any[] }) =>
    fetchJson<any>("/scheduling/run", { method: "POST", body: JSON.stringify(data) }),
  getSchedulingHistory: (limit: number = 10) =>
    fetchJson<any[]>(`/scheduling/history?limit=${limit}`),

  // Memory
  getMemoryBlocks: () =>
    fetchJson<any[]>("/memory/blocks"),
  simulateMemory: (data: { algorithm: string; blocks: any[]; processes: any[] }) =>
    fetchJson<any>("/memory/simulate", { method: "POST", body: JSON.stringify(data) }),
  resetMemoryBlocks: () =>
    fetchJson<any[]>("/memory/blocks/reset", { method: "POST" }),
  getMemoryHistory: (limit: number = 10) =>
    fetchJson<any[]>(`/memory/history?limit=${limit}`),

  // Disk
  getDiskRequests: () =>
    fetchJson<any[]>("/disk/requests"),
  addDiskRequest: (track: number, sector?: number) =>
    fetchJson<any>("/disk/requests", { method: "POST", body: JSON.stringify({ track, sector }) }),
  deleteDiskRequest: (id: string) =>
    fetchJson<any>(`/disk/requests/${id}`, { method: "DELETE" }),
  clearServicedDiskRequests: () =>
    fetchJson<any>("/disk/requests/clear-serviced", { method: "POST" }),
  simulateDisk: (data: { algorithm: string; head: number; requests: number[]; disk_size: number; direction: string }) =>
    fetchJson<any>("/disk/simulate", { method: "POST", body: JSON.stringify(data) }),
  getDiskHistory: (limit: number = 10) =>
    fetchJson<any[]>(`/disk/history?limit=${limit}`),

  // Paging
  getPagingInfo: (pid: string) =>
    fetchJson<any>(`/paging/process/${pid}`),
  simulatePaging: (data: { algorithm: string; frame_count: number; reference_string: number[] }) =>
    fetchJson<any>("/paging/simulate", { method: "POST", body: JSON.stringify(data) }),
  translateAddress: (data: { virtual_address: string; page_size?: number; pid?: string }) =>
    fetchJson<any>("/paging/translate", { method: "POST", body: JSON.stringify(data) }),

  // Filesystem
  getFileTree: () =>
    fetchJson<any[]>("/files/tree"),
  getDirectory: (path: string) =>
    fetchJson<any[]>(`/files/directory?path=${encodeURIComponent(path)}`),
  getFileContent: (path: string) =>
    fetchJson<any>(`/files/content?path=${encodeURIComponent(path)}`),
  createFile: (data: { name: string; parent_path: string; is_directory: boolean; content?: string; permissions?: string }) =>
    fetchJson<any>("/files/", { method: "POST", body: JSON.stringify(data) }),
  updateFileContent: (path: string, content: string) =>
    fetchJson<any>("/files/content", { method: "PUT", body: JSON.stringify({ path, content }) }),
  deleteFile: (path: string) =>
    fetchJson<any>(`/files/?path=${encodeURIComponent(path)}`, { method: "DELETE" }),
  renameFile: (path: string, new_name: string) =>
    fetchJson<any>("/files/rename", { method: "POST", body: JSON.stringify({ path, new_name }) }),
  getStorageStats: () =>
    fetchJson<any>("/files/storage"),

  // DBMS Observatory
  getSchemas: (includeSystem: boolean = false) =>
    fetchJson<any[]>(`/db/schemas?include_system=${includeSystem}`),
  getTables: (schema_name: string = "ALL", includeSystem: boolean = false, objectType: string = "ALL") =>
    fetchJson<any[]>(`/db/tables?schema_name=${encodeURIComponent(schema_name)}&include_system=${includeSystem}&object_type=${encodeURIComponent(objectType)}`),
  getViews: (schema_name: string = "ALL") =>
    fetchJson<any[]>(`/db/views?schema_name=${encodeURIComponent(schema_name)}`),
  getTableSchema: (tableName: string, schemaName?: string, includeSystem: boolean = true) => {
    const q = new URLSearchParams();
    if (schemaName) q.append("schema_name", schemaName);
    q.append("include_system", String(includeSystem));
    return fetchJson<any>(`/db/tables/${encodeURIComponent(tableName)}/schema?${q.toString()}`);
  },
  getTableRows: (tableName: string, limit: number = 25, schemaName?: string) => {
    const q = new URLSearchParams({ limit: limit.toString() });
    if (schemaName) q.append("schema_name", schemaName);
    return fetchJson<any>(`/db/tables/${encodeURIComponent(tableName)}/rows?${q.toString()}`);
  },
  getDbOverview: (includeSystem: boolean = false) =>
    fetchJson<any>(`/db/overview?include_system=${includeSystem}`),
  getDbRelationships: (schemaName?: string) =>
    fetchJson<any[]>(schemaName ? `/db/relationships?schema_name=${encodeURIComponent(schemaName)}` : "/db/relationships"),
  getTableRecords: (
    tableName: string,
    params?: {
      schema_name?: string;
      include_system?: boolean;
      page?: number;
      page_size?: number;
      search?: string;
      sort_by?: string;
      sort_order?: string;
      filter_column?: string;
      filter_value?: string;
    }
  ) => {
    const q = new URLSearchParams();
    if (params?.schema_name) q.append("schema_name", params.schema_name);
    if (params?.include_system !== undefined) q.append("include_system", String(params.include_system));
    if (params?.page) q.append("page", params.page.toString());
    if (params?.page_size) q.append("page_size", params.page_size.toString());
    if (params?.search) q.append("search", params.search);
    if (params?.sort_by) q.append("sort_by", params.sort_by);
    if (params?.sort_order) q.append("sort_order", params.sort_order);
    if (params?.filter_column) q.append("filter_column", params.filter_column);
    if (params?.filter_value !== undefined && params?.filter_value !== "") q.append("filter_value", params.filter_value);
    return fetchJson<any>(`/db/tables/${encodeURIComponent(tableName)}/records?${q.toString()}`);
  },
  executeDbOperation: (data: {
    operation: string;
    table: string;
    schema_name?: string;
    data?: any;
    filter_column?: string;
    filter_value?: any;
    filter_operator?: string;
    limit?: number;
    order_by?: string;
    order_dir?: string;
  }) =>
    fetchJson<any>("/db/operations/execute", { method: "POST", body: JSON.stringify(data) }),
  executeSql: (query: string, schema_name?: string) =>
    fetchJson<any>("/db/sql", { method: "POST", body: JSON.stringify({ query, schema_name }) }),

  // Transactions
  getTransactions: (status?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status && status !== "ALL") params.append("status", status);
    if (search) params.append("search", search);
    return fetchJson<any[]>(`/transactions/?${params.toString()}`);
  },
  beginTransaction: (query: string) =>
    fetchJson<any>("/transactions/begin", { method: "POST", body: JSON.stringify({ query }) }),
  commitTransaction: (txId: string) =>
    fetchJson<any>(`/transactions/${txId}/commit`, { method: "POST" }),
  rollbackTransaction: (txId: string) =>
    fetchJson<any>(`/transactions/${txId}/rollback`, { method: "POST" }),
  getLocks: () =>
    fetchJson<any[]>("/transactions/locks"),
  simulateDeadlock: (trigger: boolean) =>
    fetchJson<any>(`/transactions/deadlock/simulate?trigger=${trigger}`, { method: "POST" }),

  // Executions & Explainability Trace Engine
  getExecutionHistory: (module?: string, limit: number = 20) => {
    const params = new URLSearchParams();
    if (module && module !== "ALL") params.append("module", module);
    params.append("limit", limit.toString());
    return fetchJson<any[]>(`/executions/history?${params.toString()}`);
  },
  getExecution: (id: string) =>
    fetchJson<any>(`/executions/${id}`),
  getExecutionTrace: (id: string, offset: number = 0, limit: number = 100) =>
    fetchJson<any>(`/executions/${id}/trace?offset=${offset}&limit=${limit}`),
  getExecutionStep: (id: string, stepNumber: number) =>
    fetchJson<any>(`/executions/${id}/trace/${stepNumber}`),
  compareCpu: (data: { processes: any[]; quantum?: number }) =>
    fetchJson<any>("/executions/compare/cpu", { method: "POST", body: JSON.stringify(data) }),
  compareMemory: (data: { blocks: any[]; processes: any[] }) =>
    fetchJson<any>("/executions/compare/memory", { method: "POST", body: JSON.stringify(data) }),
  compareDisk: (data: { head: number; requests: number[]; disk_size?: number; direction?: string }) =>
    fetchJson<any>("/executions/compare/disk", { method: "POST", body: JSON.stringify(data) }),

  // Events
  getEvents: (params?: { limit?: number; severity?: string; module?: string; search?: string; execution_id?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.limit) q.append("limit", params.limit.toString());
    if (params?.severity && params.severity !== "ALL") q.append("severity", params.severity);
    if (params?.module && params.module !== "ALL") q.append("module", params.module);
    if (params?.search) q.append("search", params.search);
    if (params?.execution_id) q.append("execution_id", params.execution_id);
    if (params?.status && params.status !== "ALL") q.append("status", params.status);
    return fetchJson<any[]>(`/events/?${q.toString()}`);
  },
  createEvent: (data: { module: string; event: string; severity: string; description: string; execution_id?: string; step_number?: number; entity?: string }) =>
    fetchJson<any>("/events/", { method: "POST", body: JSON.stringify(data) }),
  clearEvents: () =>
    fetchJson<any>("/events/clear", { method: "DELETE" }),
  exportEventsUrl: (format: "csv" | "json" = "csv") =>
    `${API_BASE}/events/export?format=${format}`,

  // System Telemetry & Health
  getHealth: () =>
    fetchJson<{ status: string; message: string }>("/health"),
  getSystemMetrics: () =>
    fetchJson<any>("/system/metrics"),
};
