export type ProcessState = 'NEW' | 'READY' | 'RUNNING' | 'WAITING' | 'TERMINATED';

export interface Process {
  id: string;
  pid: string;
  name: string;
  state: ProcessState;
  arrivalTime: number;
  burstTime: number;
  priority: number;
  cpuTime: number;
  memory: number; // in MB
}

export const INITIAL_PROCESSES: Process[] = [
  { id: '1', pid: 'P101', name: 'kernel_task', state: 'RUNNING', arrivalTime: 0, burstTime: 120, priority: 0, cpuTime: 42, memory: 512 },
  { id: '2', pid: 'P102', name: 'sys_monitor', state: 'READY', arrivalTime: 2, burstTime: 45, priority: 1, cpuTime: 10, memory: 128 },
  { id: '3', pid: 'P103', name: 'db_worker_01', state: 'WAITING', arrivalTime: 5, burstTime: 300, priority: 2, cpuTime: 120, memory: 1024 },
  { id: '4', pid: 'P104', name: 'db_worker_02', state: 'READY', arrivalTime: 7, burstTime: 300, priority: 2, cpuTime: 85, memory: 1024 },
  { id: '5', pid: 'P105', name: 'log_drain', state: 'TERMINATED', arrivalTime: 1, burstTime: 15, priority: 3, cpuTime: 15, memory: 64 },
  { id: '6', pid: 'P106', name: 'auth_service', state: 'WAITING', arrivalTime: 12, burstTime: 80, priority: 1, cpuTime: 25, memory: 256 },
  { id: '7', pid: 'P107', name: 'query_opt', state: 'READY', arrivalTime: 15, burstTime: 150, priority: 2, cpuTime: 0, memory: 512 },
];

export type SystemEventSeverity = 'INFO' | 'WARNING' | 'ERROR';

export interface SystemEvent {
  id: string;
  timestamp: string;
  module: string;
  event: string;
  severity: SystemEventSeverity;
  description: string;
  execution_id?: string;
  step_number?: number;
  status?: string;
  entity?: string;
}

export const INITIAL_EVENTS: SystemEvent[] = [
  { id: 'e1', timestamp: '12:42:08.221', module: 'PROC', event: 'PROCESS_CREATED', severity: 'INFO', description: 'Process P101 created successfully.' },
  { id: 'e2', timestamp: '12:42:08.417', module: 'MEM', event: 'MEMORY_ALLOCATED', severity: 'INFO', description: 'Allocated 512MB to P101 (BLOCK 04).' },
  { id: 'e3', timestamp: '12:42:09.002', module: 'CPU', event: 'SCHEDULER_EXEC', severity: 'INFO', description: 'Round Robin / Quantum 4 initiated.' },
  { id: 'e4', timestamp: '12:42:10.150', module: 'PROC', event: 'STATE_TRANSITION', severity: 'INFO', description: 'P105 transitioned RUNNING -> TERMINATED.' },
  { id: 'e5', timestamp: '12:42:10.842', module: 'DB', event: 'DB_TRANSACTION', severity: 'INFO', description: 'Transaction 00821 COMMITTED.' },
  { id: 'e6', timestamp: '12:42:12.301', module: 'DISK', event: 'DISK_REQUEST', severity: 'WARNING', description: 'High I/O latency on Sector 7.' },
];

export interface MemoryBlock {
  id: string;
  startAddress: string;
  size: number;
  status: 'FREE' | 'ALLOCATED';
  processId?: string;
}

export const INITIAL_MEMORY_BLOCKS: MemoryBlock[] = [
  { id: 'm1', startAddress: '0x0000', size: 1024, status: 'ALLOCATED', processId: 'P101' },
  { id: 'm2', startAddress: '0x0400', size: 512, status: 'FREE' },
  { id: 'm3', startAddress: '0x0600', size: 256, status: 'ALLOCATED', processId: 'P102' },
  { id: 'm4', startAddress: '0x0700', size: 128, status: 'FREE' },
  { id: 'm5', startAddress: '0x0780', size: 2048, status: 'ALLOCATED', processId: 'P103' },
  { id: 'm6', startAddress: '0x0F80', size: 1024, status: 'FREE' },
];

export interface FileNode {
  id: string;
  name: string;
  type: 'FILE' | 'DIRECTORY';
  size: number;
  permissions: string;
  modified: string;
  children?: FileNode[];
}

export const INITIAL_FILES: FileNode[] = [
  {
    id: 'f1', name: 'root', type: 'DIRECTORY', size: 4096, permissions: 'rwxr-xr-x', modified: '2026-09-24 10:00',
    children: [
      { id: 'f2', name: 'bin', type: 'DIRECTORY', size: 4096, permissions: 'rwxr-xr-x', modified: '2026-09-24 10:00' },
      { id: 'f3', name: 'etc', type: 'DIRECTORY', size: 4096, permissions: 'rwxr-xr-x', modified: '2026-09-24 10:00',
        children: [
          { id: 'f4', name: 'aegis.conf', type: 'FILE', size: 1024, permissions: 'rw-r--r--', modified: '2026-09-24 11:30' },
          { id: 'f5', name: 'db.conf', type: 'FILE', size: 512, permissions: 'rw-------', modified: '2026-09-24 11:31' }
        ]
      },
      { id: 'f6', name: 'var', type: 'DIRECTORY', size: 4096, permissions: 'rwxr-xr-x', modified: '2026-09-24 10:00',
        children: [
          { id: 'f7', name: 'log', type: 'DIRECTORY', size: 4096, permissions: 'rwxr-xr-x', modified: '2026-09-24 12:00',
            children: [
              { id: 'f8', name: 'syslog', type: 'FILE', size: 15420, permissions: 'rw-r--r--', modified: '2026-09-24 12:42' },
              { id: 'f9', name: 'auth.log', type: 'FILE', size: 4096, permissions: 'rw-------', modified: '2026-09-24 12:40' }
            ]
          }
        ]
      }
    ]
  }
];

export interface DiskRequest {
  id: string;
  track: number;
  sector: number;
  status: 'PENDING' | 'SERVICED';
}

export const INITIAL_DISK_REQUESTS: DiskRequest[] = [
  { id: 'd1', track: 45, sector: 12, status: 'SERVICED' },
  { id: 'd2', track: 12, sector: 4, status: 'SERVICED' },
  { id: 'd3', track: 89, sector: 2, status: 'PENDING' },
  { id: 'd4', track: 34, sector: 8, status: 'PENDING' },
  { id: 'd5', track: 67, sector: 1, status: 'PENDING' },
];

export interface DBTable {
  name: string;
  rows: number;
  size: string;
  columns: string[];
}

export const INITIAL_TABLES: DBTable[] = [
  { name: 'users', rows: 1420, size: '245 KB', columns: ['id', 'username', 'password_hash', 'role', 'last_login'] },
  { name: 'audit_logs', rows: 84521, size: '12.4 MB', columns: ['id', 'timestamp', 'user_id', 'action', 'ip_address'] },
  { name: 'sessions', rows: 42, size: '16 KB', columns: ['id', 'user_id', 'token', 'expires_at'] },
  { name: 'system_config', rows: 15, size: '4 KB', columns: ['key', 'value', 'updated_at', 'updated_by'] },
];

export interface Transaction {
  id: string;
  status: 'ACTIVE' | 'COMMITTED' | 'ROLLED_BACK';
  query: string;
  duration: number;
}

export const INITIAL_TRANSACTIONS: Transaction[] = [
  { id: 'TX-00820', status: 'COMMITTED', query: 'UPDATE users SET last_login = NOW() WHERE id = 42', duration: 12 },
  { id: 'TX-00821', status: 'COMMITTED', query: 'INSERT INTO audit_logs (user_id, action) VALUES (42, "LOGIN")', duration: 8 },
  { id: 'TX-00822', status: 'ACTIVE', query: 'SELECT * FROM sessions WHERE expires_at < NOW()', duration: 45 },
  { id: 'TX-00823', status: 'ROLLED_BACK', query: 'DELETE FROM system_config WHERE key = "admin_access"', duration: 120 },
];
