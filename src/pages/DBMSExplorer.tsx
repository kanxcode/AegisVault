import { lazy, Suspense, useState, useEffect, useMemo, useCallback } from "react";
import {
  Panel,
  Badge,
  MetricDisplay,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ConfirmDialog,
  LoadingState,
  ErrorState,
  EmptyState,
} from "@/components/ui";
import {
  Database,
  Table as TableIcon,
  Key,
  RefreshCw,
  Search,
  Network,
  Play,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ArrowRight,
  Eye,
  Activity,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Layers,
  TerminalSquare,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  ShieldAlert,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { ExecutionPlayer, ExecutionTimeline, DecisionInspector } from "@/components/trace";
import { SchemaGraph2D } from "@/components/dbms/SchemaGraph2D";
import type { TraceEvent } from "@/types/trace";

const SchemaTopology3D = lazy(() => import("@/components/three/SchemaTopology3D"));

type WorkspaceTab = "OVERVIEW" | "STRUCTURE" | "RECORDS" | "RELATIONSHIPS" | "OPERATIONS" | "TRACE";
type OperationType = "SELECT" | "INSERT" | "UPDATE" | "DELETE";
type ObjectFilter = "ALL" | "TABLE" | "VIEW";

export default function DBMSExplorer() {
  const { setActiveExecution, setExecutingSimulation, pushNotification } = useStore();

  // Dynamic Discovery State
  const [schemas, setSchemas] = useState<any[]>([]);
  const [catalogObjects, setCatalogObjects] = useState<any[]>([]);
  const [includeSystem, setIncludeSystem] = useState<boolean>(false);
  const [objectFilter, setObjectFilter] = useState<ObjectFilter>("ALL");
  const [objectSearch, setObjectSearch] = useState<string>("");
  const [expandedSchemas, setExpandedSchemas] = useState<Record<string, boolean>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const [selectedTable, setSelectedTable] = useState<string>("");
  const [selectedSchemaName, setSelectedSchemaName] = useState<string | undefined>(undefined);
  const [overview, setOverview] = useState<any>(null);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Tab Navigation
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("OVERVIEW");
  const [topologyMode, setTopologyMode] = useState<"2D" | "3D">("2D");

  // Structure Tab State
  const [tableSchemaData, setTableSchemaData] = useState<any>(null);
  const [structureSubTab, setStructureSubTab] = useState<"COLUMNS" | "INDEXES" | "FOREIGN_KEYS" | "DDL">("COLUMNS");
  const [loadingSchema, setLoadingSchema] = useState<boolean>(false);

  // Records Tab State
  const [records, setRecords] = useState<any[]>([]);
  const [recordsCols, setRecordsCols] = useState<string[]>([]);
  const [recordsPage, setRecordsPage] = useState<number>(1);
  const [recordsPageSize, setRecordsPageSize] = useState<number>(15);
  const [recordsTotalCount, setRecordsTotalCount] = useState<number>(0);
  const [recordsIsEstimated, setRecordsIsEstimated] = useState<boolean>(false);
  const [recordsTotalPages, setRecordsTotalPages] = useState<number>(1);
  const [recordsSearch, setRecordsSearch] = useState<string>("");
  const [recordsSortBy, setRecordsSortBy] = useState<string>("");
  const [recordsSortOrder, setRecordsSortOrder] = useState<"asc" | "desc">("asc");
  const [recordsFilterCol, setRecordsFilterCol] = useState<string>("");
  const [recordsFilterVal, setRecordsFilterVal] = useState<string>("");
  const [recordsLoading, setRecordsLoading] = useState<boolean>(false);
  const [recordsError, setRecordsError] = useState<string | null>(null);

  // Relationships Tab State
  const [relationships, setRelationships] = useState<any[]>([]);
  const [relFilterTable, setRelFilterTable] = useState<string>("ALL");

  // Operations Tab State
  const [opType, setOpType] = useState<OperationType>("SELECT");
  const [opTargetTable, setOpTargetTable] = useState<string>("");
  const [opFilterCol, setOpFilterCol] = useState<string>("");
  const [opFilterVal, setOpFilterVal] = useState<string>("");
  const [opFilterOp, setOpFilterOp] = useState<string>("=");
  const [opOrderBy, setOpOrderBy] = useState<string>("");
  const [opOrderDir, setOpOrderDir] = useState<"ASC" | "DESC">("ASC");
  const [opLimit, setOpLimit] = useState<number>(20);
  const [insertForm, setInsertForm] = useState<Record<string, any>>({});
  const [updateForm, setUpdateForm] = useState<Record<string, any>>({});
  const [deleteConfirmed, setDeleteConfirmed] = useState<boolean>(false);
  const [confirmDeleteDialog, setConfirmDeleteDialog] = useState<boolean>(false);
  const [opExecuting, setOpExecuting] = useState<boolean>(false);
  const [opResult, setOpResult] = useState<any | null>(null);
  const [opError, setOpError] = useState<string | null>(null);
  const [targetPreviewRecord, setTargetPreviewRecord] = useState<any | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);

  // Execution Trace Tab State
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);
  const [traceHistory, setTraceHistory] = useState<any[]>([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string>("");

  // Dynamic Catalog Discovery
  const loadCatalog = useCallback(async () => {
    setLoadingOverview(true);
    setCatalogError(null);
    try {
      const [ovData, objsData, relsData] = await Promise.all([
        api.getDbOverview(includeSystem),
        api.getTables("ALL", includeSystem, "ALL"),
        api.getDbRelationships(),
      ]);

      setOverview(ovData);
      setSchemas(ovData?.schemas || []);
      setCatalogObjects(objsData || []);
      setRelationships(relsData || []);

      // Auto-expand discovered schemas and object groups on initial discovery
      setExpandedSchemas((prev) => {
        const next = { ...prev };
        (ovData?.schemas || []).forEach((s: any) => {
          if (next[s.name] === undefined) next[s.name] = true;
        });
        return next;
      });
      setExpandedGroups((prev) => {
        const next = { ...prev };
        (ovData?.schemas || []).forEach((s: any) => {
          if (next[`${s.name}:TABLE`] === undefined) next[`${s.name}:TABLE`] = true;
          if (next[`${s.name}:VIEW`] === undefined) next[`${s.name}:VIEW`] = true;
          if (next[`${s.name}:SYSTEM_TABLE`] === undefined) next[`${s.name}:SYSTEM_TABLE`] = false;
        });
        return next;
      });

      if (objsData && objsData.length > 0) {
        setSelectedTable((curr) => {
          if (curr && objsData.some((o: any) => o.name === curr)) return curr;
          return objsData[0].name;
        });
        setOpTargetTable((curr) => {
          if (curr && objsData.some((o: any) => o.name === curr)) return curr;
          return objsData[0].name;
        });
      }
    } catch (err: any) {
      setCatalogError(err?.message || "Failed to connect to database catalog.");
    } finally {
      setLoadingOverview(false);
    }
  }, [includeSystem]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    api
      .getExecutionHistory("dbms", 10)
      .then((hist) => Array.isArray(hist) && setTraceHistory(hist))
      .catch(() => {});
  }, []);

  // Load Table/View Schema
  const loadTableSchema = useCallback(
    async (tableName: string, schemaName?: string) => {
      if (!tableName) return;
      setLoadingSchema(true);
      try {
        const schemaRes = await api.getTableSchema(tableName, schemaName, true);
        setTableSchemaData(schemaRes);
        if (schemaRes?.primary_keys?.length > 0) {
          setOpFilterCol(schemaRes.primary_keys[0]);
        } else if (schemaRes?.columns?.length > 0) {
          setOpFilterCol(schemaRes.columns[0].name);
        }
      } catch (err) {
        console.error("Failed to load object schema:", err);
      } finally {
        setLoadingSchema(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedTable) {
      loadTableSchema(selectedTable, selectedSchemaName);
      setOpTargetTable(selectedTable);
    }
  }, [selectedTable, selectedSchemaName, loadTableSchema]);

  // Load Paginated Records
  const loadRecords = useCallback(async () => {
    if (!selectedTable) return;
    setRecordsLoading(true);
    setRecordsError(null);
    try {
      const res = await api.getTableRecords(selectedTable, {
        schema_name: selectedSchemaName,
        include_system: true,
        page: recordsPage,
        page_size: recordsPageSize,
        search: recordsSearch.trim() || undefined,
        sort_by: recordsSortBy || undefined,
        sort_order: recordsSortOrder,
        filter_column: recordsFilterCol || undefined,
        filter_value: recordsFilterVal || undefined,
      });
      setRecords(res.rows || []);
      setRecordsCols(res.columns || []);
      setRecordsTotalCount(res.total_count || 0);
      setRecordsIsEstimated(Boolean(res.count_is_estimated));
      setRecordsTotalPages(res.total_pages || 1);
    } catch (err: any) {
      setRecordsError(err?.message || "Failed to fetch records");
      setRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  }, [
    selectedTable,
    selectedSchemaName,
    recordsPage,
    recordsPageSize,
    recordsSearch,
    recordsSortBy,
    recordsSortOrder,
    recordsFilterCol,
    recordsFilterVal,
  ]);

  useEffect(() => {
    if (activeTab === "RECORDS") {
      loadRecords();
    }
  }, [activeTab, loadRecords]);

  const handleSelectObject = (objName: string, schemaName?: string) => {
    setSelectedTable(objName);
    setSelectedSchemaName(schemaName);
    setOpTargetTable(objName);
    setRecordsPage(1);
    setRecordsSearch("");
    setRecordsSortBy("");
    setRecordsFilterCol("");
    setRecordsFilterVal("");
    setTargetPreviewRecord(null);
    setOpResult(null);
    setOpError(null);
  };

  const filteredCatalogObjects = useMemo(() => {
    return catalogObjects.filter((obj) => {
      if (objectFilter !== "ALL" && obj.object_type !== objectFilter) return false;
      if (objectSearch.trim()) {
        return obj.name.toLowerCase().includes(objectSearch.trim().toLowerCase());
      }
      return true;
    });
  }, [catalogObjects, objectFilter, objectSearch]);

  const handlePreviewTargetRecord = async () => {
    if (!opFilterCol || !opFilterVal.trim()) return;
    setPreviewLoading(true);
    try {
      const res = await api.getTableRecords(opTargetTable, {
        schema_name: selectedSchemaName,
        page: 1,
        page_size: 1,
        filter_column: opFilterCol,
        filter_value: opFilterVal.trim(),
      });
      if (res.rows?.length > 0) {
        setTargetPreviewRecord(res.rows[0]);
        if (opType === "UPDATE") setUpdateForm({ ...res.rows[0] });
      } else {
        setTargetPreviewRecord(null);
      }
    } catch {
      setTargetPreviewRecord(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const runStructuredOperation = async () => {
    setOpExecuting(true);
    setExecutingSimulation(true);
    setOpError(null);
    setOpResult(null);

    try {
      const payload: any = {
        operation: opType,
        table: opTargetTable,
        schema_name: selectedSchemaName,
      };

      if (opType === "SELECT") {
        payload.filter_column = opFilterCol || undefined;
        payload.filter_value = opFilterVal.trim() || undefined;
        payload.filter_operator = opFilterOp;
        payload.order_by = opOrderBy || undefined;
        payload.order_dir = opOrderDir;
        payload.limit = opLimit;
      } else if (opType === "INSERT") {
        payload.data = insertForm;
      } else if (opType === "UPDATE") {
        payload.filter_column = opFilterCol;
        payload.filter_value = opFilterVal.trim();
        payload.data = updateForm;
      } else if (opType === "DELETE") {
        payload.filter_column = opFilterCol;
        payload.filter_value = opFilterVal.trim();
      }

      const res = await api.executeDbOperation(payload);
      setOpResult(res);

      if (!res.success) {
        setOpError(res.error || "Operation failed.");
      } else {
        pushNotification({
          title: `DBMS ${opType} COMPLETE`,
          message: `${opTargetTable}: ${res.affected_rows} row(s) affected`,
          severity: "SUCCESS",
          module: "DB",
          execution_id: res.execution_id,
        });
      }

      if (res.trace_events?.length > 0) {
        setTraceEvents(res.trace_events);
        setCurrentStep(0);
        setSelectedExecutionId(res.execution_id || "");
        setActiveExecution({
          execution_id: res.execution_id,
          module: "dbms",
          algorithm: opType,
          status: res.success ? "COMPLETED" : "REJECTED",
          total_steps: res.trace_events.length,
        });
      }

      if (res.success && ["INSERT", "UPDATE", "DELETE"].includes(opType)) {
        loadTableSchema(opTargetTable, selectedSchemaName);
        loadRecords();
        loadCatalog();
        setDeleteConfirmed(false);
        setTargetPreviewRecord(null);
      }
    } catch (err: any) {
      setOpError(err?.message || "Operation failed to dispatch");
    } finally {
      setOpExecuting(false);
      setExecutingSimulation(false);
      setConfirmDeleteDialog(false);
    }
  };

  const handleExecuteOperation = () => {
    if (opType === "DELETE") {
      if (!deleteConfirmed) {
        setOpError("Confirm deletion checkbox before executing destructive DELETE.");
        return;
      }
      setConfirmDeleteDialog(true);
      return;
    }
    runStructuredOperation();
  };

  const handleSelectHistoryTrace = async (execId: string) => {
    if (!execId) return;
    try {
      const exec = await api.getExecution(execId);
      if (exec?.trace_events) {
        setTraceEvents(exec.trace_events);
        setCurrentStep(0);
        setSelectedExecutionId(execId);
      }
    } catch (err) {
      console.error("Failed to load historical trace:", err);
    }
  };

  const generatedDDL = useMemo(() => {
    if (!tableSchemaData) return "";
    if (tableSchemaData.object_type === "VIEW") {
      return `CREATE VIEW ${tableSchemaData.table_name} AS\n${tableSchemaData.view_definition || "-- View definition unavailable"};`;
    }
    const lines: string[] = [`CREATE TABLE ${tableSchemaData.table_name} (`];
    const colDefs = (tableSchemaData.columns || []).map((col: any) => {
      let def = `  ${col.name} ${col.type}`;
      if (!col.nullable) def += " NOT NULL";
      if (col.primary_key) def += " PRIMARY KEY";
      if (col.default !== null && col.default !== undefined) def += ` DEFAULT ${col.default}`;
      return def;
    });
    (tableSchemaData.foreign_keys || []).forEach((fk: any) => {
      colDefs.push(
        `  CONSTRAINT ${fk.name || `fk_${fk.constrained_columns?.join("_")}`} FOREIGN KEY (${fk.constrained_columns?.join(", ")}) REFERENCES ${fk.referred_table} (${fk.referred_columns?.join(", ")})`
      );
    });
    lines.push(colDefs.join(",\n"));
    lines.push(");");
    return lines.join("\n");
  }, [tableSchemaData]);

  const userTables = catalogObjects.filter((o) => o.object_type === "TABLE");
  const userViews = catalogObjects.filter((o) => o.object_type === "VIEW");
  const selectedObjMeta = catalogObjects.find((o) => o.name === selectedTable);
  const isReadOnlyObject = selectedObjMeta?.object_type === "VIEW" || selectedObjMeta?.object_type === "SYSTEM_TABLE";

  return (
    <div className="flex flex-col gap-4 max-w-[1440px] mx-auto pb-10 font-mono">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1C252C] pb-3.5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#0C1013] border border-[#1C252C] rounded-[2px] text-[#4ADE80]">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold tracking-[0.08em] text-[#E6EDF3] uppercase flex items-center gap-2">
              <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#12271B] border border-[#265438] text-[#4ADE80] rounded-[2px]">
                DBM-01
              </span>
              Database Observatory &amp; Schema Explorer
            </h1>
            <p className="text-[10px] text-[#8B98A5] tracking-widest uppercase mt-0.5">
              {overview?.dialect || "SQLITE"} • {overview?.database_name || "connecting..."} •{" "}
              {overview ? `${overview.total_tables} TABLES · ${overview.total_views} VIEWS · ${overview.latency_ms}ms` : "DISCOVERING CATALOG"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIncludeSystem((v) => !v)}
            className={cn(
              "h-8 px-2.5 text-[10px] border rounded-[2px] cursor-pointer transition-colors",
              includeSystem
                ? "bg-[#281E0E] border-[#594019] text-[#F59E0B] font-bold"
                : "bg-[#0C1013] border-[#1C252C] text-[#8B98A5] hover:text-[#E6EDF3]"
            )}
          >
            {includeSystem ? "SYSTEM OBJECTS: ON" : "SYSTEM OBJECTS: OFF"}
          </button>
          <button
            onClick={loadCatalog}
            disabled={loadingOverview}
            className="h-8 flex items-center gap-1.5 px-3 text-xs bg-[#12271B] hover:bg-[#183525] text-[#4ADE80] border border-[#265438] rounded-[2px] transition-colors cursor-pointer"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loadingOverview && "animate-spin")} />
            <span>REFRESH SCHEMA</span>
          </button>
        </div>
      </div>

      {catalogError && <ErrorState message={catalogError} onRetry={loadCatalog} />}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ================================================================= */}
        {/* A. HIERARCHICAL DATABASE NAVIGATION SIDEBAR (3 COLS)              */}
        {/* ================================================================= */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          <Panel title="Connection Telemetry" code="LINK" brackets>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between py-1 border-b border-[#141B21]">
                <span className="text-[#53616E]">DATABASE</span>
                <span className="text-[#E6EDF3] font-bold truncate max-w-[140px]">
                  {overview?.database_name || "—"}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#141B21]">
                <span className="text-[#53616E]">DIALECT</span>
                <span className="text-[#38BDF8] font-bold">{overview?.dialect || "—"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#141B21]">
                <span className="text-[#53616E]">SCHEMAS</span>
                <span className="text-[#E6EDF3]">{schemas.length}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#53616E]">TABLES / VIEWS</span>
                <span className="text-[#4ADE80]">
                  {overview?.total_tables ?? userTables.length} / {overview?.total_views ?? userViews.length}
                </span>
              </div>
            </div>
          </Panel>

          {/* Hierarchical Tree Browser */}
          <Panel title="Catalog Navigator" code="TREE" className="min-h-[540px]" brackets>
            <div className="space-y-2.5 flex-1 flex flex-col">
              {/* Filter Tabs */}
              <div className="grid grid-cols-3 gap-1 bg-[#080B0D] p-1 border border-[#1C252C] rounded-[2px] text-[10px]">
                {(["ALL", "TABLE", "VIEW"] as ObjectFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setObjectFilter(f)}
                    className={cn(
                      "py-1 rounded-[2px] font-bold cursor-pointer",
                      objectFilter === f
                        ? "bg-[#12271B] text-[#4ADE80] border border-[#265438]"
                        : "text-[#8B98A5] hover:text-[#E6EDF3]"
                    )}
                  >
                    {f === "ALL" ? "ALL" : f === "TABLE" ? "TABLES" : "VIEWS"}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[#53616E]" />
                <input
                  type="text"
                  placeholder="Filter tables & views..."
                  value={objectSearch}
                  onChange={(e) => setObjectSearch(e.target.value)}
                  className="w-full h-7 bg-[#080B0D] border border-[#1C252C] pl-8 pr-2 text-xs text-[#E6EDF3] placeholder-[#53616E] rounded-[2px] focus:outline-none focus:border-[#3ECF72]"
                />
              </div>

              {/* DATABASE -> SCHEMAS -> TABLES / VIEWS Hierarchy */}
              <div className="flex-1 overflow-y-auto custom-scrollbar max-h-[420px] space-y-1.5 pr-1 text-xs">
                <div className="flex items-center gap-1.5 px-1.5 py-1 text-[10px] text-[#4ADE80] font-bold">
                  <Database className="w-3.5 h-3.5" />
                  <span className="truncate">{overview?.database_name || "DATABASE"}</span>
                </div>

                {schemas.map((sch) => {
                  const isSchExpanded = expandedSchemas[sch.name] ?? true;
                  const schemaObjects = filteredCatalogObjects.filter((o) => o.schema_name === sch.name);
                  const schTables = schemaObjects.filter((o) => o.object_type === "TABLE");
                  const schViews = schemaObjects.filter((o) => o.object_type === "VIEW");
                  const schSys = schemaObjects.filter((o) => o.object_type === "SYSTEM_TABLE");

                  return (
                    <div key={sch.name} className="pl-2 border-l border-[#1C252C] space-y-1">
                      <button
                        onClick={() =>
                          setExpandedSchemas((prev) => ({ ...prev, [sch.name]: !isSchExpanded }))
                        }
                        className="w-full flex items-center justify-between px-1.5 py-1 hover:bg-[#11161B] rounded-[2px] text-[11px] text-[#38BDF8] font-semibold cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          {isSchExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          <FolderOpen className="w-3 h-3" />
                          <span className="truncate">{sch.name}</span>
                        </span>
                        <span className="text-[9px] text-[#53616E]">
                          {sch.tables_count}T/{sch.views_count}V
                        </span>
                      </button>

                      {isSchExpanded && (
                        <div className="pl-2 space-y-1.5">
                          {/* TABLES GROUP */}
                          {(objectFilter === "ALL" || objectFilter === "TABLE") && schTables.length > 0 && (
                            <div>
                              <button
                                onClick={() =>
                                  setExpandedGroups((p) => ({
                                    ...p,
                                    [`${sch.name}:TABLE`]: !(p[`${sch.name}:TABLE`] ?? true),
                                  }))
                                }
                                className="w-full flex items-center justify-between px-1 py-0.5 text-[10px] text-[#53616E] hover:text-[#E6EDF3] cursor-pointer"
                              >
                                <span className="flex items-center gap-1">
                                  {(expandedGroups[`${sch.name}:TABLE`] ?? true) ? (
                                    <ChevronDown className="w-2.5 h-2.5" />
                                  ) : (
                                    <ChevronRight className="w-2.5 h-2.5" />
                                  )}
                                  <span>TABLES ({schTables.length})</span>
                                </span>
                              </button>
                              {(expandedGroups[`${sch.name}:TABLE`] ?? true) && (
                                <div className="space-y-0.5 mt-0.5 pl-1">
                                  {schTables.map((t) => {
                                    const active = selectedTable === t.name;
                                    return (
                                      <button
                                        key={`${sch.name}.${t.name}`}
                                        onClick={() => handleSelectObject(t.name, sch.name)}
                                        className={cn(
                                          "w-full flex items-center justify-between px-2 py-1.5 rounded-[2px] text-left border transition-colors cursor-pointer",
                                          active
                                            ? "bg-[#12271B]/60 text-[#4ADE80] border-[#265438]"
                                            : "bg-[#080B0D] text-[#8B98A5] border-transparent hover:bg-[#11161B] hover:text-[#E6EDF3]"
                                        )}
                                      >
                                        <span className="flex items-center gap-1.5 truncate">
                                          <TableIcon className="w-3 h-3 shrink-0" />
                                          <span className="truncate font-semibold">{t.name}</span>
                                        </span>
                                        <span className="text-[9px] text-[#53616E] shrink-0">{t.rows}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* VIEWS GROUP */}
                          {(objectFilter === "ALL" || objectFilter === "VIEW") && schViews.length > 0 && (
                            <div>
                              <button
                                onClick={() =>
                                  setExpandedGroups((p) => ({
                                    ...p,
                                    [`${sch.name}:VIEW`]: !(p[`${sch.name}:VIEW`] ?? true),
                                  }))
                                }
                                className="w-full flex items-center justify-between px-1 py-0.5 text-[10px] text-[#38BDF8] hover:text-[#E6EDF3] cursor-pointer"
                              >
                                <span className="flex items-center gap-1">
                                  {(expandedGroups[`${sch.name}:VIEW`] ?? true) ? (
                                    <ChevronDown className="w-2.5 h-2.5" />
                                  ) : (
                                    <ChevronRight className="w-2.5 h-2.5" />
                                  )}
                                  <span>VIEWS ({schViews.length})</span>
                                </span>
                              </button>
                              {(expandedGroups[`${sch.name}:VIEW`] ?? true) && (
                                <div className="space-y-0.5 mt-0.5 pl-1">
                                  {schViews.map((v) => {
                                    const active = selectedTable === v.name;
                                    return (
                                      <button
                                        key={`${sch.name}.${v.name}`}
                                        onClick={() => handleSelectObject(v.name, sch.name)}
                                        className={cn(
                                          "w-full flex items-center justify-between px-2 py-1.5 rounded-[2px] text-left border transition-colors cursor-pointer",
                                          active
                                            ? "bg-[#0F2430] text-[#38BDF8] border-[#1E4B63]"
                                            : "bg-[#080B0D] text-[#8B98A5] border-transparent hover:bg-[#11161B] hover:text-[#E6EDF3]"
                                        )}
                                      >
                                        <span className="flex items-center gap-1.5 truncate">
                                          <Eye className="w-3 h-3 shrink-0 text-[#38BDF8]" />
                                          <span className="truncate font-semibold">{v.name}</span>
                                        </span>
                                        <span className="text-[9px] text-[#53616E] shrink-0">{v.rows}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* SYSTEM TABLES GROUP */}
                          {includeSystem && schSys.length > 0 && (
                            <div>
                              <button
                                onClick={() =>
                                  setExpandedGroups((p) => ({
                                    ...p,
                                    [`${sch.name}:SYSTEM_TABLE`]: !(p[`${sch.name}:SYSTEM_TABLE`] ?? true),
                                  }))
                                }
                                className="w-full flex items-center justify-between px-1 py-0.5 text-[10px] text-[#F59E0B] cursor-pointer"
                              >
                                <span className="flex items-center gap-1">
                                  <ShieldAlert className="w-2.5 h-2.5" />
                                  <span>SYSTEM ({schSys.length})</span>
                                </span>
                              </button>
                              {(expandedGroups[`${sch.name}:SYSTEM_TABLE`] ?? true) && (
                                <div className="space-y-0.5 mt-0.5 pl-1">
                                  {schSys.map((st) => (
                                    <button
                                      key={`${sch.name}.${st.name}`}
                                      onClick={() => handleSelectObject(st.name, sch.name)}
                                      className={cn(
                                        "w-full flex items-center justify-between px-2 py-1 rounded-[2px] text-left border cursor-pointer",
                                        selectedTable === st.name
                                          ? "bg-[#281E0E] text-[#F59E0B] border-[#594019]"
                                          : "bg-[#080B0D] text-[#8B98A5] border-transparent hover:bg-[#11161B]"
                                      )}
                                    >
                                      <span className="truncate">{st.name}</span>
                                      <span className="text-[9px]">{st.rows}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>
        </div>

        {/* ================================================================= */}
        {/* B. MAIN OBSERVATORY WORKSPACE (9 COLS)                            */}
        {/* ================================================================= */}
        <div className="lg:col-span-9 flex flex-col gap-3">
          {/* Tab Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0C1013] border border-[#1C252C] p-1.5 rounded-[2px]">
            <div className="flex flex-wrap gap-1">
              {[
                { id: "OVERVIEW", label: "1. OVERVIEW", icon: Layers },
                { id: "STRUCTURE", label: "2. STRUCTURE & META", icon: TableIcon },
                { id: "RECORDS", label: "3. RECORDS", icon: Eye },
                { id: "RELATIONSHIPS", label: "4. TOPOLOGY", icon: Network },
                { id: "OPERATIONS", label: "5. OPERATIONS", icon: TerminalSquare },
                { id: "TRACE", label: "6. TRACE", icon: Activity },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as WorkspaceTab)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-[2px] transition-colors cursor-pointer",
                      isActive
                        ? "bg-[#12271B] text-[#4ADE80] font-bold border border-[#265438]"
                        : "text-[#8B98A5] hover:text-[#E6EDF3] hover:bg-[#11161B]"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {selectedTable && (
              <div className="flex items-center gap-2 px-2 text-xs">
                <Badge variant={selectedObjMeta?.object_type === "VIEW" ? "cyan" : "green"}>
                  {selectedObjMeta?.object_type || "TABLE"}
                </Badge>
                <span className="text-[#E6EDF3] font-bold">{selectedTable}</span>
              </div>
            )}
          </div>

          {/* 1. OVERVIEW */}
          {activeTab === "OVERVIEW" && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricDisplay
                  label="DATABASE DIALECT"
                  value={overview?.dialect || "—"}
                  sublabel={overview?.database_name || "No catalog"}
                  accent="green"
                />
                <MetricDisplay
                  label="ACCESSIBLE TABLES"
                  value={overview?.total_tables ?? userTables.length}
                  sublabel={`${overview?.total_views ?? userViews.length} SQL views discovered`}
                  accent="cyan"
                />
                <MetricDisplay
                  label="INDEXED RECORDS"
                  value={overview?.total_records?.toLocaleString() ?? 0}
                  sublabel="Across user tables"
                  accent="amber"
                />
                <MetricDisplay
                  label="FOREIGN KEY LINKS"
                  value={overview?.foreign_keys_count ?? relationships.length}
                  sublabel="Introspected constraints"
                  accent="neutral"
                />
              </div>

              <Panel title="Discovered Tables & Views Catalog" code="CAT" noPadding>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>OBJECT</TableHead>
                      <TableHead>TYPE</TableHead>
                      <TableHead>SCHEMA</TableHead>
                      <TableHead className="text-right">COLUMNS</TableHead>
                      <TableHead>PRIMARY KEY</TableHead>
                      <TableHead className="text-right">ROWS</TableHead>
                      <TableHead className="text-right">INSPECT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catalogObjects.map((obj) => (
                      <TableRow
                        key={`${obj.schema_name}.${obj.name}`}
                        className={selectedTable === obj.name ? "bg-[#12271B]/35" : ""}
                      >
                        <TableCell className="font-bold flex items-center gap-2">
                          {obj.object_type === "VIEW" ? (
                            <Eye className="w-3.5 h-3.5 text-[#38BDF8]" />
                          ) : (
                            <TableIcon className="w-3.5 h-3.5 text-[#4ADE80]" />
                          )}
                          <span>{obj.name}</span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              obj.object_type === "VIEW"
                                ? "cyan"
                                : obj.object_type === "SYSTEM_TABLE"
                                ? "amber"
                                : "green"
                            }
                          >
                            {obj.object_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[#8B98A5]">{obj.schema_name}</TableCell>
                        <TableCell className="text-right">{obj.column_count ?? obj.columns?.length ?? 0}</TableCell>
                        <TableCell>
                          {obj.primary_key ? (
                            <span className="text-[#F59E0B] flex items-center gap-1">
                              <Key className="w-3 h-3" /> {obj.primary_key}
                            </span>
                          ) : (
                            <span className="text-[#53616E]">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {obj.rows?.toLocaleString() ?? 0}
                          {obj.count_is_estimated && (
                            <span className="text-[9px] text-[#F59E0B] ml-1">~est</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => {
                                handleSelectObject(obj.name, obj.schema_name);
                                setActiveTab("STRUCTURE");
                              }}
                              className="px-2 py-0.5 text-[10px] bg-[#11161B] hover:bg-[#171E24] border border-[#1C252C] rounded-[2px] cursor-pointer"
                            >
                              Schema
                            </button>
                            <button
                              onClick={() => {
                                handleSelectObject(obj.name, obj.schema_name);
                                setActiveTab("RECORDS");
                              }}
                              className="px-2 py-0.5 text-[10px] bg-[#12271B] hover:bg-[#183525] border border-[#265438] text-[#4ADE80] rounded-[2px] cursor-pointer"
                            >
                              Records
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Panel>
            </div>
          )}

          {/* 2. STRUCTURE & METADATA */}
          {activeTab === "STRUCTURE" && (
            <div className="flex flex-col gap-4">
              <div className="p-3.5 bg-[#0C1013] border border-[#1C252C] rounded-[2px] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#080B0D] border border-[#1C252C] rounded-[2px] text-[#4ADE80]">
                    {tableSchemaData?.object_type === "VIEW" ? <Eye className="w-4 h-4 text-[#38BDF8]" /> : <TableIcon className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-sm font-bold text-[#E6EDF3]">
                      <span>{selectedTable}</span>
                      <Badge variant={tableSchemaData?.object_type === "VIEW" ? "cyan" : "green"}>
                        {tableSchemaData?.object_type || "TABLE"}
                      </Badge>
                      <Badge variant="gray">SCHEMA: {tableSchemaData?.schema_name || "main"}</Badge>
                    </div>
                    <p className="text-[10px] text-[#8B98A5] mt-0.5">
                      {tableSchemaData?.columns?.length ?? 0} Columns • {tableSchemaData?.row_count ?? 0} Rows (
                      {tableSchemaData?.count_is_estimated ? "ESTIMATED" : "EXACT"}) • {tableSchemaData?.size_formatted ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="flex gap-1 bg-[#080B0D] p-1 border border-[#1C252C] rounded-[2px] text-[10px]">
                  {[
                    { id: "COLUMNS", label: "COLUMNS" },
                    { id: "INDEXES", label: "INDEXES" },
                    { id: "FOREIGN_KEYS", label: "CONSTRAINTS & FK" },
                    { id: "DDL", label: tableSchemaData?.object_type === "VIEW" ? "VIEW SQL" : "DDL" },
                  ].map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => setStructureSubTab(sub.id as any)}
                      className={cn(
                        "px-2.5 py-1 rounded-[2px] cursor-pointer",
                        structureSubTab === sub.id
                          ? "bg-[#12271B] text-[#4ADE80] border border-[#265438] font-bold"
                          : "text-[#8B98A5] hover:text-[#E6EDF3]"
                      )}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
              </div>

              {loadingSchema ? (
                <LoadingState label="INTROSPECTING OBJECT SCHEMA..." />
              ) : (
                <>
                  {structureSubTab === "COLUMNS" && (
                    <Panel title={`Column Definitions // ${selectedTable}`} code="COLS" noPadding>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>COLUMN</TableHead>
                            <TableHead>TYPE</TableHead>
                            <TableHead>NULLABLE</TableHead>
                            <TableHead>CONSTRAINTS</TableHead>
                            <TableHead>DEFAULT</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tableSchemaData?.columns?.map((col: any) => (
                            <TableRow key={col.name}>
                              <TableCell className="font-bold flex items-center gap-1.5">
                                {col.primary_key && <Key className="w-3 h-3 text-[#F59E0B]" />}
                                <span>{col.name}</span>
                              </TableCell>
                              <TableCell className="text-[#38BDF8]">{col.type}</TableCell>
                              <TableCell>
                                <Badge variant={col.nullable ? "gray" : "red"}>
                                  {col.nullable ? "NULLABLE" : "NOT NULL"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-[#8B98A5] text-[10px]">
                                {col.constraints?.length ? col.constraints.join(", ") : "—"}
                              </TableCell>
                              <TableCell className="text-[#8B98A5]">
                                {col.default !== null && col.default !== undefined ? String(col.default) : "NULL"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Panel>
                  )}

                  {structureSubTab === "INDEXES" && (
                    <Panel title={`Indexes // ${selectedTable}`} code="IDX">
                      {tableSchemaData?.indexes?.length > 0 ? (
                        <div className="space-y-2">
                          {tableSchemaData.indexes.map((idx: any, i: number) => (
                            <div
                              key={i}
                              className="p-3 bg-[#080B0D] border border-[#1C252C] rounded-[2px] flex items-center justify-between text-xs"
                            >
                              <div>
                                <div className="text-[#4ADE80] font-bold">{idx.name || `idx_${i}`}</div>
                                <div className="text-[11px] text-[#8B98A5]">
                                  Columns: <strong className="text-[#E6EDF3]">{idx.columns?.join(", ")}</strong>
                                </div>
                              </div>
                              <Badge variant={idx.unique ? "amber" : "gray"}>
                                {idx.unique ? "UNIQUE" : "NON-UNIQUE"}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState
                          title="NO SECONDARY INDEXES"
                          description="Primary key clustering is active; no auxiliary secondary indexes declared."
                        />
                      )}
                    </Panel>
                  )}

                  {structureSubTab === "FOREIGN_KEYS" && (
                    <Panel title={`Constraints & Foreign Keys // ${selectedTable}`} code="CNST">
                      {tableSchemaData?.constraints?.length > 0 ? (
                        <div className="space-y-2">
                          {tableSchemaData.constraints.map((c: any, i: number) => (
                            <div
                              key={i}
                              className="p-3 bg-[#080B0D] border border-[#1C252C] rounded-[2px] flex items-center justify-between text-xs"
                            >
                              <div>
                                <div className="font-bold text-[#E6EDF3]">{c.name}</div>
                                <div className="text-[11px] text-[#8B98A5]">
                                  {c.columns?.join(", ")} {c.references ? `→ ${c.references}` : c.expression || ""}
                                </div>
                              </div>
                              <Badge variant={c.type === "PRIMARY KEY" ? "amber" : c.type === "FOREIGN KEY" ? "cyan" : "gray"}>
                                {c.type}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState title="NO CONSTRAINTS DECLARED" />
                      )}
                    </Panel>
                  )}

                  {structureSubTab === "DDL" && (
                    <Panel title={`Definition // ${selectedTable}`} code="DDL">
                      <pre className="p-4 bg-[#080B0D] border border-[#1C252C] rounded-[2px] text-xs text-[#F59E0B] overflow-x-auto">
                        {generatedDDL}
                      </pre>
                    </Panel>
                  )}
                </>
              )}
            </div>
          )}

          {/* 3. RECORDS BROWSER */}
          {activeTab === "RECORDS" && (
            <div className="flex flex-col gap-3">
              <div className="p-3 bg-[#0C1013] border border-[#1C252C] rounded-[2px] flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[#53616E]" />
                    <input
                      type="text"
                      placeholder="Search values..."
                      value={recordsSearch}
                      onChange={(e) => setRecordsSearch(e.target.value)}
                      className="h-8 bg-[#080B0D] border border-[#1C252C] pl-8 pr-2 text-xs text-[#E6EDF3] rounded-[2px]"
                    />
                  </div>
                  <select
                    value={recordsFilterCol}
                    onChange={(e) => setRecordsFilterCol(e.target.value)}
                    className="h-8 bg-[#080B0D] border border-[#1C252C] px-2 text-xs text-[#E6EDF3] rounded-[2px]"
                  >
                    <option value="">All Columns</option>
                    {recordsCols.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {recordsFilterCol && (
                    <input
                      type="text"
                      placeholder={`Filter ${recordsFilterCol}...`}
                      value={recordsFilterVal}
                      onChange={(e) => setRecordsFilterVal(e.target.value)}
                      className="h-8 bg-[#080B0D] border border-[#1C252C] px-2 text-xs text-[#E6EDF3] rounded-[2px]"
                    />
                  )}
                  <button
                    onClick={() => {
                      setRecordsPage(1);
                      loadRecords();
                    }}
                    className="h-8 px-3 bg-[#12271B] border border-[#265438] text-[#4ADE80] font-bold rounded-[2px] cursor-pointer"
                  >
                    QUERY
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={recordsIsEstimated ? "amber" : "cyan"}>
                    {recordsTotalCount.toLocaleString()} {recordsIsEstimated ? "ESTIMATED" : "EXACT"}
                  </Badge>
                  <select
                    value={recordsPageSize}
                    onChange={(e) => {
                      setRecordsPageSize(Number(e.target.value));
                      setRecordsPage(1);
                    }}
                    className="h-8 bg-[#080B0D] border border-[#1C252C] px-2 text-xs text-[#E6EDF3] rounded-[2px]"
                  >
                    <option value={10}>10 / page</option>
                    <option value={15}>15 / page</option>
                    <option value={25}>25 / page</option>
                    <option value={50}>50 / page</option>
                  </select>
                </div>
              </div>

              <Panel title={`Records Grid // ${selectedTable}`} code="GRID" noPadding>
                {recordsError ? (
                  <div className="p-4"><ErrorState message={recordsError} onRetry={loadRecords} /></div>
                ) : recordsLoading ? (
                  <LoadingState label="QUERYING DATABASE RECORDS..." />
                ) : records.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      title={`NO RECORDS IN ${selectedTable}`}
                      description="No rows matched the current search or filter criteria."
                    />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {recordsCols.map((col) => {
                          const isSorted = recordsSortBy === col;
                          return (
                            <TableHead
                              key={col}
                              onClick={() => {
                                if (isSorted) {
                                  setRecordsSortOrder(recordsSortOrder === "asc" ? "desc" : "asc");
                                } else {
                                  setRecordsSortBy(col);
                                  setRecordsSortOrder("asc");
                                }
                              }}
                              className="cursor-pointer hover:text-[#E6EDF3]"
                            >
                              <div className="flex items-center gap-1">
                                <span>{col}</span>
                                {isSorted ? (
                                  recordsSortOrder === "asc" ? (
                                    <ArrowUp className="w-3 h-3 text-[#4ADE80]" />
                                  ) : (
                                    <ArrowDown className="w-3 h-3 text-[#4ADE80]" />
                                  )
                                ) : (
                                  <ArrowUpDown className="w-3 h-3 text-[#53616E]" />
                                )}
                              </div>
                            </TableHead>
                          );
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((row, rIdx) => (
                        <TableRow key={rIdx}>
                          {recordsCols.map((col, cIdx) => (
                            <TableCell key={cIdx} className="whitespace-nowrap max-w-[260px] truncate">
                              {row[col] === null || row[col] === undefined ? (
                                <span className="text-[#53616E] italic">NULL</span>
                              ) : (
                                String(row[col])
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                <div className="p-3 border-t border-[#1C252C] flex items-center justify-between text-xs">
                  <span className="text-[#8B98A5]">
                    Page <strong className="text-[#E6EDF3]">{recordsPage}</strong> of{" "}
                    <strong className="text-[#E6EDF3]">{recordsTotalPages}</strong>
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setRecordsPage(1)}
                      disabled={recordsPage <= 1 || recordsLoading}
                      className="px-2 py-1 bg-[#080B0D] border border-[#1C252C] disabled:opacity-40 rounded-[2px] cursor-pointer"
                    >
                      First
                    </button>
                    <button
                      onClick={() => setRecordsPage((p) => Math.max(1, p - 1))}
                      disabled={recordsPage <= 1 || recordsLoading}
                      className="px-2.5 py-1 bg-[#080B0D] border border-[#1C252C] disabled:opacity-40 rounded-[2px] cursor-pointer"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => setRecordsPage((p) => Math.min(recordsTotalPages, p + 1))}
                      disabled={recordsPage >= recordsTotalPages || recordsLoading}
                      className="px-2.5 py-1 bg-[#080B0D] border border-[#1C252C] disabled:opacity-40 rounded-[2px] cursor-pointer"
                    >
                      Next
                    </button>
                    <button
                      onClick={() => setRecordsPage(recordsTotalPages)}
                      disabled={recordsPage >= recordsTotalPages || recordsLoading}
                      className="px-2 py-1 bg-[#080B0D] border border-[#1C252C] disabled:opacity-40 rounded-[2px] cursor-pointer"
                    >
                      Last
                    </button>
                  </div>
                </div>
              </Panel>
            </div>
          )}

          {/* 4. SCHEMA VISUALIZATION (2D ZOOM/PAN + 3D THREE.JS) */}
          {activeTab === "RELATIONSHIPS" && (
            <div className="flex flex-col gap-4">
              <div className="p-3 bg-[#0C1013] border border-[#1C252C] rounded-[2px] flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4 text-[#4ADE80]" />
                  <span className="font-bold text-[#E6EDF3]">Schema Relationship Observatory</span>
                  <Badge variant="cyan">{relationships.length} LINKS</Badge>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex bg-[#080B0D] p-0.5 border border-[#1C252C] rounded-[2px]">
                    <button
                      onClick={() => setTopologyMode("2D")}
                      className={cn(
                        "px-2.5 py-1 text-[10px] rounded-[2px] cursor-pointer",
                        topologyMode === "2D" ? "bg-[#12271B] text-[#4ADE80] font-bold" : "text-[#8B98A5]"
                      )}
                    >
                      2D INTERACTIVE GRAPH
                    </button>
                    <button
                      onClick={() => setTopologyMode("3D")}
                      className={cn(
                        "px-2.5 py-1 text-[10px] rounded-[2px] cursor-pointer",
                        topologyMode === "3D" ? "bg-[#0F2430] text-[#38BDF8] font-bold" : "text-[#8B98A5]"
                      )}
                    >
                      3D SPATIAL (WEBGL)
                    </button>
                  </div>

                  <select
                    value={relFilterTable}
                    onChange={(e) => setRelFilterTable(e.target.value)}
                    className="h-8 bg-[#080B0D] border border-[#1C252C] px-2 text-xs text-[#E6EDF3] rounded-[2px]"
                  >
                    <option value="ALL">All Entities</option>
                    {catalogObjects.map((t) => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {topologyMode === "2D" ? (
                <SchemaGraph2D
                  nodes={catalogObjects}
                  edges={relationships.filter(
                    (r) => relFilterTable === "ALL" || r.source_table === relFilterTable || r.target_table === relFilterTable
                  )}
                  selectedNode={selectedTable}
                  onSelectNode={(name) => handleSelectObject(name)}
                  onNavigateStructure={(name) => {
                    handleSelectObject(name);
                    setActiveTab("STRUCTURE");
                  }}
                  onNavigateRecords={(name) => {
                    handleSelectObject(name);
                    setActiveTab("RECORDS");
                  }}
                />
              ) : (
                <Suspense fallback={<LoadingState label="INITIALIZING 3D TOPOLOGY RENDERER..." />}>
                  <SchemaTopology3D
                    nodes={catalogObjects}
                    edges={relationships.filter(
                      (r) => relFilterTable === "ALL" || r.source_table === relFilterTable || r.target_table === relFilterTable
                    )}
                    selectedNode={selectedTable}
                    onSelectNode={(name) => handleSelectObject(name)}
                    onInspectTable={(name) => {
                      handleSelectObject(name);
                      setActiveTab("STRUCTURE");
                    }}
                  />
                </Suspense>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {relationships
                  .filter((r) => relFilterTable === "ALL" || r.source_table === relFilterTable || r.target_table === relFilterTable)
                  .map((rel) => (
                    <div key={rel.id} className="p-3 bg-[#0C1013] border border-[#1C252C] rounded-[2px] space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <Badge variant={rel.is_physical ? "green" : "amber"}>
                          {rel.is_physical ? "PHYSICAL FK" : "LOGICAL RELATION"}
                        </Badge>
                        <span className="text-[10px] text-[#38BDF8]">{rel.cardinality || "N:1"}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-[#080B0D] border border-[#141B21] rounded-[2px]">
                        <span className="text-[#F59E0B] font-bold">
                          {rel.source_table}.{rel.source_column}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-[#4ADE80]" />
                        <span className="text-[#38BDF8] font-bold">
                          {rel.target_table}.{rel.target_column}
                        </span>
                      </div>
                      <p className="text-[10px] text-[#8B98A5]">{rel.description}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* 5. VALIDATED OPERATIONS */}
          {activeTab === "OPERATIONS" && (
            <div className="flex flex-col gap-4">
              {isReadOnlyObject && (
                <div className="p-3 bg-[#281E0E]/60 border border-[#594019] text-[#F59E0B] rounded-[2px] text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    Selected object <strong>{selectedTable}</strong> is a {selectedObjMeta?.object_type} (read-only). Only SELECT operations are permitted.
                  </span>
                </div>
              )}

              <div className="p-3 bg-[#0C1013] border border-[#1C252C] rounded-[2px] flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-1">
                  {(["SELECT", "INSERT", "UPDATE", "DELETE"] as OperationType[]).map((op) => {
                    const disabled = isReadOnlyObject && op !== "SELECT";
                    return (
                      <button
                        key={op}
                        disabled={disabled}
                        onClick={() => {
                          setOpType(op);
                          setOpResult(null);
                          setOpError(null);
                          setDeleteConfirmed(false);
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-[2px] font-bold cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed",
                          opType === op
                            ? op === "DELETE"
                              ? "bg-[#2A1215] text-[#F87171] border border-[#5B2329]"
                              : "bg-[#12271B] text-[#4ADE80] border border-[#265438]"
                            : "text-[#8B98A5] hover:bg-[#11161B]"
                        )}
                      >
                        {op}
                      </button>
                    );
                  })}
                </div>

                <select
                  value={opTargetTable}
                  onChange={(e) => {
                    handleSelectObject(e.target.value);
                    setInsertForm({});
                    setUpdateForm({});
                  }}
                  className="h-8 bg-[#080B0D] border border-[#1C252C] px-2.5 text-xs text-[#E6EDF3] font-bold rounded-[2px]"
                >
                  {catalogObjects.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name} ({t.object_type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-7">
                  <Panel title={`Operation Builder // ${opType} ON ${opTargetTable}`} code="OP">
                    {opType === "SELECT" && (
                      <div className="space-y-3 text-xs">
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] text-[#8B98A5] block mb-1">Filter Column</label>
                            <select
                              value={opFilterCol}
                              onChange={(e) => setOpFilterCol(e.target.value)}
                              className="w-full h-8 bg-[#080B0D] border border-[#1C252C] px-2 rounded-[2px]"
                            >
                              <option value="">No Filter</option>
                              {tableSchemaData?.columns?.map((c: any) => (
                                <option key={c.name} value={c.name}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-[#8B98A5] block mb-1">Operator</label>
                            <select
                              value={opFilterOp}
                              onChange={(e) => setOpFilterOp(e.target.value)}
                              className="w-full h-8 bg-[#080B0D] border border-[#1C252C] px-2 rounded-[2px]"
                            >
                              <option value="=">=</option>
                              <option value="!=">!=</option>
                              <option value="LIKE">LIKE</option>
                              <option value=">">&gt;</option>
                              <option value="<">&lt;</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-[#8B98A5] block mb-1">Value</label>
                            <input
                              type="text"
                              value={opFilterVal}
                              onChange={(e) => setOpFilterVal(e.target.value)}
                              className="w-full h-8 bg-[#080B0D] border border-[#1C252C] px-2 rounded-[2px]"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[10px] text-[#8B98A5] block mb-1">Order By</label>
                            <select
                              value={opOrderBy}
                              onChange={(e) => setOpOrderBy(e.target.value)}
                              className="w-full h-8 bg-[#080B0D] border border-[#1C252C] px-2 rounded-[2px]"
                            >
                              <option value="">Default</option>
                              {tableSchemaData?.columns?.map((c: any) => (
                                <option key={c.name} value={c.name}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-[#8B98A5] block mb-1">Direction</label>
                            <select
                              value={opOrderDir}
                              onChange={(e) => setOpOrderDir(e.target.value as any)}
                              className="w-full h-8 bg-[#080B0D] border border-[#1C252C] px-2 rounded-[2px]"
                            >
                              <option value="ASC">ASC</option>
                              <option value="DESC">DESC</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-[#8B98A5] block mb-1">Limit</label>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={opLimit}
                              onChange={(e) => setOpLimit(Number(e.target.value))}
                              className="w-full h-8 bg-[#080B0D] border border-[#1C252C] px-2 rounded-[2px]"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {opType === "INSERT" && (
                      <div className="space-y-2.5 text-xs max-h-[340px] overflow-y-auto custom-scrollbar pr-1">
                        {tableSchemaData?.columns?.map((col: any) => (
                          <div key={col.name} className="space-y-1">
                            <div className="flex justify-between text-[10px] text-[#8B98A5]">
                              <span className="font-bold text-[#E6EDF3]">{col.name}</span>
                              <span>{col.type}</span>
                            </div>
                            <input
                              type="text"
                              placeholder={col.primary_key ? "PK (auto if blank)" : `Enter ${col.name}...`}
                              value={insertForm[col.name] ?? ""}
                              onChange={(e) => setInsertForm({ ...insertForm, [col.name]: e.target.value })}
                              className="w-full h-8 bg-[#080B0D] border border-[#1C252C] px-2 rounded-[2px]"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {opType === "UPDATE" && (
                      <div className="space-y-3 text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={opFilterCol}
                            onChange={(e) => setOpFilterCol(e.target.value)}
                            className="h-8 bg-[#080B0D] border border-[#1C252C] px-2 rounded-[2px]"
                          >
                            {tableSchemaData?.columns?.map((c: any) => (
                              <option key={c.name} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              placeholder="WHERE value..."
                              value={opFilterVal}
                              onChange={(e) => setOpFilterVal(e.target.value)}
                              className="flex-1 h-8 bg-[#080B0D] border border-[#1C252C] px-2 rounded-[2px]"
                            />
                            <button
                              type="button"
                              onClick={handlePreviewTargetRecord}
                              disabled={previewLoading || !opFilterVal.trim()}
                              className="px-2.5 h-8 bg-[#11161B] border border-[#1C252C] text-[10px] rounded-[2px] cursor-pointer"
                            >
                              Fetch
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2 max-h-[240px] overflow-y-auto custom-scrollbar">
                          {tableSchemaData?.columns
                            ?.filter((c: any) => !c.primary_key)
                            ?.map((col: any) => (
                              <div key={col.name} className="space-y-1">
                                <span className="text-[10px] text-[#8B98A5]">{col.name}</span>
                                <input
                                  type="text"
                                  value={updateForm[col.name] ?? ""}
                                  onChange={(e) => setUpdateForm({ ...updateForm, [col.name]: e.target.value })}
                                  className="w-full h-7 bg-[#080B0D] border border-[#1C252C] px-2 rounded-[2px]"
                                />
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {opType === "DELETE" && (
                      <div className="space-y-3 text-xs">
                        <div className="p-3 bg-[#2A1215]/70 border border-[#5B2329] rounded-[2px] text-[#F87171] text-[11px]">
                          DESTRUCTIVE OPERATION: Foreign key integrity checks run before commit. Confirmation required.
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={opFilterCol}
                            onChange={(e) => setOpFilterCol(e.target.value)}
                            className="h-8 bg-[#080B0D] border border-[#1C252C] px-2 rounded-[2px]"
                          >
                            {tableSchemaData?.columns?.map((c: any) => (
                              <option key={c.name} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              placeholder="Key value..."
                              value={opFilterVal}
                              onChange={(e) => setOpFilterVal(e.target.value)}
                              className="flex-1 h-8 bg-[#080B0D] border border-[#1C252C] px-2 rounded-[2px]"
                            />
                            <button
                              type="button"
                              onClick={handlePreviewTargetRecord}
                              className="px-2.5 h-8 bg-[#11161B] border border-[#1C252C] text-[10px] rounded-[2px] cursor-pointer"
                            >
                              Inspect
                            </button>
                          </div>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={deleteConfirmed}
                            onChange={(e) => setDeleteConfirmed(e.target.checked)}
                          />
                          <span>Confirm deletion target in {opTargetTable}</span>
                        </label>
                      </div>
                    )}
                  </Panel>
                </div>

                <div className="lg:col-span-5">
                  <Panel title="Execution Guard & Dispatch" code="EXEC" brackets>
                    <div className="space-y-3 text-xs">
                      <div className="p-2.5 bg-[#080B0D] border border-[#1C252C] rounded-[2px]">
                        <div className="text-[10px] text-[#4ADE80] font-bold">PARAMETERIZED TRANSACTION BOUNDARY</div>
                        <p className="text-[10px] text-[#8B98A5] mt-1">
                          Validates object catalog, column types, primary/foreign keys, and records full step trace.
                        </p>
                      </div>

                      {targetPreviewRecord && (
                        <pre className="p-2 bg-[#080B0D] border border-[#1C252C] rounded-[2px] text-[10px] text-[#38BDF8] overflow-x-auto">
                          {JSON.stringify(targetPreviewRecord, null, 2)}
                        </pre>
                      )}

                      <button
                        onClick={handleExecuteOperation}
                        disabled={opExecuting || isReadOnlyObject && opType !== "SELECT" || (opType === "DELETE" && !deleteConfirmed)}
                        className={cn(
                          "w-full h-9 rounded-[2px] font-bold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40",
                          opType === "DELETE"
                            ? "bg-[#2A1215] border border-[#5B2329] text-[#F87171]"
                            : "bg-[#12271B] border border-[#265438] text-[#4ADE80]"
                        )}
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>{opExecuting ? "EXECUTING..." : `EXECUTE ${opType}`}</span>
                      </button>
                    </div>
                  </Panel>
                </div>
              </div>

              {(opResult || opError) && (
                <div
                  className={cn(
                    "p-4 rounded-[2px] border space-y-2",
                    opResult?.success ? "bg-[#12271B]/50 border-[#265438]" : "bg-[#2A1215]/60 border-[#5B2329]"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {opResult?.success ? (
                        <CheckCircle2 className="w-4 h-4 text-[#4ADE80]" />
                      ) : (
                        <XCircle className="w-4 h-4 text-[#F87171]" />
                      )}
                      <span className={opResult?.success ? "text-[#4ADE80] font-bold" : "text-[#F87171] font-bold"}>
                        {opResult?.message || opError}
                      </span>
                    </div>
                    {opResult?.trace_events?.length > 0 && (
                      <button
                        onClick={() => setActiveTab("TRACE")}
                        className="px-2.5 py-1 bg-[#0C1013] border border-[#1C252C] text-[#38BDF8] text-[10px] rounded-[2px] cursor-pointer"
                      >
                        INSPECT TRACE ({opResult.trace_events.length})
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 6. EXECUTION TRACE */}
          {activeTab === "TRACE" && (
            <div className="flex flex-col gap-3">
              <div className="p-3 bg-[#0C1013] border border-[#1C252C] rounded-[2px] flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#4ADE80]" />
                  <span className="font-bold">DBMS Execution Trace Engine</span>
                  {selectedExecutionId && <Badge variant="cyan">{selectedExecutionId}</Badge>}
                </div>

                {traceHistory.length > 0 && (
                  <select
                    value={selectedExecutionId}
                    onChange={(e) => handleSelectHistoryTrace(e.target.value)}
                    className="h-8 bg-[#080B0D] border border-[#1C252C] px-2 text-xs rounded-[2px]"
                  >
                    <option value="">Select historical trace...</option>
                    {traceHistory.map((h) => (
                      <option key={h.execution_id} value={h.execution_id}>
                        {h.algorithm} ({h.execution_id.slice(-8)})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <ExecutionPlayer
                traceEvents={traceEvents}
                currentStep={currentStep}
                onStepChange={setCurrentStep}
                isPlaying={isPlaying}
                setIsPlaying={setIsPlaying}
                speed={speed}
                setSpeed={setSpeed}
                moduleName="DBMS OBSERVATORY"
              />
              <ExecutionTimeline
                traceEvents={traceEvents}
                currentStep={currentStep}
                onSelectStep={setCurrentStep}
              />
              <DecisionInspector
                event={traceEvents[currentStep] || null}
                stepNumber={currentStep + 1}
                totalSteps={traceEvents.length}
              />
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteDialog}
        title={`Confirm DELETE on ${opTargetTable}`}
        description={`Delete record where ${opFilterCol} = '${opFilterVal}'? Referential integrity constraints will be checked before commit.`}
        confirmLabel="DELETE RECORD"
        onConfirm={runStructuredOperation}
        onCancel={() => setConfirmDeleteDialog(false)}
      />
    </div>
  );
}
