import { create } from 'zustand';
import { api } from './api';
import type {
  Process,
  SystemEvent,
  MemoryBlock,
  FileNode,
  DiskRequest,
  DBTable,
  Transaction,
} from './simulation/mockData';
import {
  INITIAL_PROCESSES,
  INITIAL_EVENTS,
  INITIAL_MEMORY_BLOCKS,
  INITIAL_FILES,
  INITIAL_DISK_REQUESTS,
  INITIAL_TABLES,
  INITIAL_TRANSACTIONS,
} from './simulation/mockData';

export interface ActiveExecutionInfo {
  execution_id: string;
  module: string;
  algorithm: string;
  status: string;
  total_steps?: number;
  created_at?: string;
}

export interface DbStatusInfo {
  status: string;
  dialect: string;
  database_name: string;
  latency_ms: number;
  total_tables: number;
  total_records: number;
  foreign_keys_count: number;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
  module?: string;
  execution_id?: string;
  timestamp: string;
  read: boolean;
}

export interface AegisSettings {
  scanlines: boolean;
  gridBackground: boolean;
  reducedMotion: 'system' | 'reduce' | 'allow';
  pollingIntervalMs: number;
}

const DEFAULT_SETTINGS: AegisSettings = {
  scanlines: true,
  gridBackground: true,
  reducedMotion: 'system',
  pollingIntervalMs: 5000,
};

function loadSettings(): AegisSettings {
  try {
    const raw = localStorage.getItem('aegis_settings');
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_SETTINGS;
}

export type OperationalSystemState = 'NOMINAL' | 'EXECUTING' | 'DEGRADED' | 'OFFLINE' | 'CHECKING';

interface SystemState {
  processes: Process[];
  events: SystemEvent[];
  memoryBlocks: MemoryBlock[];
  files: FileNode[];
  diskRequests: DiskRequest[];
  tables: DBTable[];
  transactions: Transaction[];
  cpuUtilization: number | null;
  memoryUtilization: number | null;
  diskQueueCount: number;
  activeTxCount: number;
  telemetryHistory: any[];

  // Real connection & operational telemetry
  backendConnected: boolean | null;
  backendLatencyMs: number | null;
  dbConnected: boolean | null;
  dbInfo: DbStatusInfo | null;
  activeExecution: ActiveExecutionInfo | null;
  isExecutingSimulation: boolean;
  lastCheckedAt: string | null;

  // Notifications & Settings
  notifications: AppNotification[];
  settings: AegisSettings;

  // Derived helper
  getSystemState: () => OperationalSystemState;

  // Actions
  refreshSystemStatus: () => Promise<void>;
  setActiveExecution: (exec: ActiveExecutionInfo | null) => void;
  setExecutingSimulation: (running: boolean) => void;
  pushNotification: (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  updateSettings: (partial: Partial<AegisSettings>) => void;

  fetchProcesses: () => Promise<void>;
  createProcess: (p: { pid: string; name: string; burst_time: number; priority: number; memory: number }) => Promise<void>;
  updateProcessState: (pid: string, state: Process['state']) => Promise<void>;
  deleteProcess: (pid: string) => Promise<void>;
  resetProcesses: () => Promise<void>;

  fetchEvents: (filters?: { severity?: string; module?: string; search?: string; limit?: number }) => Promise<void>;
  addEvent: (event: Omit<SystemEvent, 'id' | 'timestamp'>) => void;
  clearEvents: () => Promise<void>;

  fetchMemoryBlocks: () => Promise<void>;
  fetchDiskRequests: () => Promise<void>;
  addDiskRequest: (track: number, sector?: number) => Promise<void>;

  fetchFiles: () => Promise<void>;
  fetchTables: (schema?: string) => Promise<void>;
  fetchTransactions: (status?: string, search?: string) => Promise<void>;
  fetchSystemMetrics: () => Promise<void>;
}

export const useStore = create<SystemState>((set, get) => ({
  processes: INITIAL_PROCESSES,
  events: INITIAL_EVENTS,
  memoryBlocks: INITIAL_MEMORY_BLOCKS,
  files: INITIAL_FILES,
  diskRequests: INITIAL_DISK_REQUESTS,
  tables: INITIAL_TABLES,
  transactions: INITIAL_TRANSACTIONS,
  cpuUtilization: null,
  memoryUtilization: null,
  diskQueueCount: 0,
  activeTxCount: 0,
  telemetryHistory: [],

  backendConnected: null,
  backendLatencyMs: null,
  dbConnected: null,
  dbInfo: null,
  activeExecution: null,
  isExecutingSimulation: false,
  lastCheckedAt: null,

  notifications: [],
  settings: loadSettings(),

  getSystemState: () => {
    const s = get();
    if (s.backendConnected === null) return 'CHECKING';
    if (!s.backendConnected) return 'OFFLINE';
    if (s.dbConnected === false) return 'DEGRADED';
    if (s.isExecutingSimulation) return 'EXECUTING';
    return 'NOMINAL';
  },

  refreshSystemStatus: async () => {
    const start = performance.now();
    try {
      const health = await api.getHealth();
      const latency = Math.round(performance.now() - start);
      const isHealthy = health?.status === 'ok';
      set({
        backendConnected: isHealthy,
        backendLatencyMs: latency,
        lastCheckedAt: new Date().toLocaleTimeString(),
      });

      const [ovRes, histRes] = await Promise.allSettled([
        api.getDbOverview(),
        api.getExecutionHistory('ALL', 1),
      ]);

      if (ovRes.status === 'fulfilled' && ovRes.value) {
        const ov = ovRes.value;
        set({
          dbConnected: ov.status === 'ONLINE' || ov.status === 'CONNECTED' || Boolean(ov.database_name),
          dbInfo: {
            status: ov.status || 'ONLINE',
            dialect: ov.dialect || 'SQLITE',
            database_name: ov.database_name || 'aegis.db',
            latency_ms: ov.latency_ms ?? 0,
            total_tables: ov.total_tables ?? 0,
            total_records: ov.total_records ?? 0,
            foreign_keys_count: ov.foreign_keys_count ?? 0,
          },
        });
      } else {
        set({ dbConnected: false, dbInfo: null });
      }

      if (histRes.status === 'fulfilled' && Array.isArray(histRes.value) && histRes.value.length > 0) {
        const latest = histRes.value[0];
        if (!get().activeExecution) {
          set({
            activeExecution: {
              execution_id: latest.execution_id,
              module: latest.module,
              algorithm: latest.algorithm,
              status: latest.status,
              total_steps: latest.total_steps,
              created_at: latest.created_at,
            },
          });
        }
      }
    } catch {
      set({
        backendConnected: false,
        backendLatencyMs: null,
        dbConnected: false,
        dbInfo: null,
        lastCheckedAt: new Date().toLocaleTimeString(),
      });
    }
  },

  setActiveExecution: (exec) => set({ activeExecution: exec }),
  setExecutingSimulation: (running) => set({ isExecutingSimulation: running }),

  pushNotification: (n) => {
    const now = new Date();
    const timestamp = now.toTimeString().slice(0, 8);
    const item: AppNotification = {
      ...n,
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp,
      read: false,
    };
    set((state) => ({
      notifications: [item, ...state.notifications].slice(0, 30),
    }));
  },

  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    })),

  clearNotifications: () => set({ notifications: [] }),

  updateSettings: (partial) =>
    set((state) => {
      const next = { ...state.settings, ...partial };
      try {
        localStorage.setItem('aegis_settings', JSON.stringify(next));
      } catch {
        // ignore
      }
      return { settings: next };
    }),

  fetchProcesses: async () => {
    try {
      const data = await api.getProcesses();
      if (Array.isArray(data)) {
        set({
          processes: data.map((p) => ({
            id: p.id.toString(),
            pid: p.pid,
            name: p.name,
            state: p.state as any,
            arrivalTime: p.arrival_time,
            burstTime: p.burst_time,
            priority: p.priority,
            cpuTime: p.cpu_time,
            memory: p.memory,
          })),
          backendConnected: true,
        });
      }
    } catch {
      // Backend offline — retain last known list
    }
  },

  createProcess: async (procData) => {
    try {
      const created = await api.createProcess(procData);
      set((state) => ({
        processes: [
          ...state.processes,
          {
            id: created.id.toString(),
            pid: created.pid,
            name: created.name,
            state: created.state as any,
            arrivalTime: created.arrival_time,
            burstTime: created.burst_time,
            priority: created.priority,
            cpuTime: created.cpu_time,
            memory: created.memory,
          },
        ],
      }));
      get().fetchEvents();
      get().fetchSystemMetrics();
    } catch {
      const fallbackProc: Process = {
        id: `p_${Date.now()}`,
        pid: procData.pid,
        name: procData.name,
        state: 'READY',
        arrivalTime: 0,
        burstTime: procData.burst_time,
        priority: procData.priority,
        cpuTime: 0,
        memory: procData.memory,
      };
      set((state) => ({ processes: [...state.processes, fallbackProc] }));
      get().addEvent({
        module: 'PROC',
        event: 'PROCESS_CREATED',
        severity: 'INFO',
        description: `Process ${procData.pid} created (local fallback).`,
      });
    }
  },

  updateProcessState: async (pid, newState) => {
    set((state) => ({
      processes: state.processes.map((p) => (p.pid === pid ? { ...p, state: newState } : p)),
    }));

    try {
      await api.updateProcessState(pid, newState);
      get().fetchEvents();
      get().fetchSystemMetrics();
    } catch {
      get().addEvent({
        module: 'PROC',
        event: 'STATE_TRANSITION',
        severity: 'INFO',
        description: `${pid} transitioned to ${newState}.`,
      });
    }
  },

  deleteProcess: async (pid) => {
    set((state) => ({
      processes: state.processes.filter((p) => p.pid !== pid),
    }));
    try {
      await api.deleteProcess(pid);
      get().fetchEvents();
      get().fetchSystemMetrics();
    } catch {
      get().addEvent({
        module: 'PROC',
        event: 'PROCESS_TERMINATED',
        severity: 'WARNING',
        description: `Process ${pid} terminated.`,
      });
    }
  },

  resetProcesses: async () => {
    try {
      const data = await api.resetProcesses();
      set({
        processes: data.map((p) => ({
          id: p.id.toString(),
          pid: p.pid,
          name: p.name,
          state: p.state as any,
          arrivalTime: p.arrival_time,
          burstTime: p.burst_time,
          priority: p.priority,
          cpuTime: p.cpu_time,
          memory: p.memory,
        })),
      });
    } catch {
      set({ processes: INITIAL_PROCESSES });
    }
  },

  fetchEvents: async (filters) => {
    try {
      const data = await api.getEvents(filters);
      if (Array.isArray(data)) {
        set({
          events: data.map((e) => ({
            id: e.id.toString(),
            timestamp: e.timestamp,
            module: e.module,
            event: e.event,
            severity: e.severity,
            description: e.description,
            execution_id: e.execution_id,
            step_number: e.step_number,
            status: e.status,
            entity: e.entity,
          })),
        });
      }
    } catch {
      // retain local
    }
  },

  addEvent: (eventData) => {
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
    const newEvent: SystemEvent = {
      ...eventData,
      id: `e${Date.now()}`,
      timestamp,
    };
    set((state) => ({ events: [newEvent, ...state.events].slice(0, 100) }));
    api
      .createEvent({
        module: eventData.module,
        event: eventData.event,
        severity: eventData.severity,
        description: eventData.description,
      })
      .catch(() => {});
  },

  clearEvents: async () => {
    set({ events: [] });
    try {
      await api.clearEvents();
    } catch {
      // ignore
    }
  },

  fetchMemoryBlocks: async () => {
    try {
      const data = await api.getMemoryBlocks();
      if (Array.isArray(data) && data.length > 0) {
        set({
          memoryBlocks: data.map((b) => ({
            id: b.id,
            startAddress: b.startAddress,
            size: b.size,
            status: b.status as any,
            processId: b.processId,
          })),
        });
      }
    } catch {
      // retain
    }
  },

  fetchDiskRequests: async () => {
    try {
      const data = await api.getDiskRequests();
      if (Array.isArray(data)) {
        set({
          diskRequests: data.map((d) => ({
            id: d.id,
            track: d.track,
            sector: d.sector,
            status: d.status as any,
          })),
          diskQueueCount: data.filter((d) => d.status === 'PENDING').length,
        });
      }
    } catch {
      // retain
    }
  },

  addDiskRequest: async (track, sector) => {
    try {
      const req = await api.addDiskRequest(track, sector);
      set((state) => ({
        diskRequests: [
          ...state.diskRequests,
          {
            id: req.id,
            track: req.track,
            sector: req.sector,
            status: req.status as any,
          },
        ],
        diskQueueCount: state.diskQueueCount + 1,
      }));
    } catch {
      const newReq: DiskRequest = {
        id: `d${Date.now() % 1000}`,
        track,
        sector: sector || 1,
        status: 'PENDING',
      };
      set((state) => ({
        diskRequests: [...state.diskRequests, newReq],
        diskQueueCount: state.diskQueueCount + 1,
      }));
    }
  },

  fetchFiles: async () => {
    try {
      const tree = await api.getFileTree();
      if (Array.isArray(tree) && tree.length > 0) {
        set({ files: tree });
      }
    } catch {
      // retain
    }
  },

  fetchTables: async (schema = 'aegis_main') => {
    try {
      const tables = await api.getTables(schema);
      if (Array.isArray(tables) && tables.length > 0) {
        set({ tables });
      }
    } catch {
      // retain
    }
  },

  fetchTransactions: async (status, search) => {
    try {
      const txs = await api.getTransactions(status, search);
      if (Array.isArray(txs)) {
        set({
          transactions: txs.map((t) => ({
            id: t.id,
            status: t.status as any,
            query: t.query,
            duration: t.duration_ms,
          })),
          activeTxCount: txs.filter((t) => t.status === 'ACTIVE').length,
        });
      }
    } catch {
      // retain
    }
  },

  fetchSystemMetrics: async () => {
    try {
      const m = await api.getSystemMetrics();
      if (m) {
        set({
          cpuUtilization: m.cpu_utilization,
          memoryUtilization: m.memory_utilization,
          diskQueueCount: m.disk_queue,
          activeTxCount: m.active_transactions,
          telemetryHistory: m.telemetry || [],
          backendConnected: true,
        });
      }
    } catch {
      set({ backendConnected: false });
    }
  },
}));
