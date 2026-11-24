import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import Dashboard from "./pages/Dashboard";
import ProcessManager from "./pages/ProcessManager";
import CPUScheduler from "./pages/CPUScheduler";
import MemoryManager from "./pages/MemoryManager";
import Paging from "./pages/Paging";
import FileManager from "./pages/FileManager";
import DiskScheduler from "./pages/DiskScheduler";
import DBMSExplorer from "./pages/DBMSExplorer";
import DatabaseRelationships from "./pages/DatabaseRelationships";
import SQLConsole from "./pages/SQLConsole";
import Transactions from "./pages/Transactions";
import AlgorithmBattleLab from "./pages/AlgorithmBattleLab";
import EventLogs from "./pages/EventLogs";
import SystemMonitor from "./pages/SystemMonitor";
import CommandTerminal from "./pages/CommandTerminal";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="os/processes" element={<ProcessManager />} />
          <Route path="os/scheduler" element={<CPUScheduler />} />
          <Route path="os/memory" element={<MemoryManager />} />
          <Route path="os/paging" element={<Paging />} />
          <Route path="os/files" element={<FileManager />} />
          <Route path="os/disk" element={<DiskScheduler />} />

          <Route path="db/explorer" element={<DBMSExplorer />} />
          <Route path="db/relationships" element={<DatabaseRelationships />} />
          <Route path="db/sql" element={<SQLConsole />} />
          <Route path="db/transactions" element={<Transactions />} />

          <Route path="analytics/battle-lab" element={<AlgorithmBattleLab />} />
          <Route path="logs" element={<EventLogs />} />
          <Route path="monitor" element={<SystemMonitor />} />
          <Route path="terminal" element={<CommandTerminal />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
