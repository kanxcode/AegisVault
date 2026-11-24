import { useState, useEffect, useCallback } from "react";
import { Panel, Badge } from "@/components/ui";
import { Network, Key, ArrowRight, RefreshCw, Database, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function DatabaseRelationships() {
  const [relationships, setRelationships] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rels, ov] = await Promise.all([api.getDbRelationships(), api.getDbOverview()]);
      setRelationships(rels || []);
      setTables(ov?.tables || []);
      if (ov?.tables?.length > 0) {
        setSelectedEntity((prev) => prev ?? ov.tables[0].name);
      }
    } catch (err: any) {
      setError(err?.message || "Unable to fetch schema relationships from backend.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <div className="flex flex-col gap-4 max-w-[1440px] mx-auto pb-8 font-mono">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1C252C] pb-3.5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#0F2430] border border-[#1E4B63] text-[#38BDF8] rounded-[2px]">
              REL-04
            </span>
            <Network className="w-4 h-4 text-[#38BDF8]" />
            <h1 className="font-display text-xl font-bold tracking-[0.08em] text-[#E6EDF3] uppercase">
              Relational Schema Topology
            </h1>
            <Badge variant="green" dot>
              REAL SCHEMA GRAPH
            </Badge>
          </div>
          <p className="text-[10px] text-[#8B98A5] tracking-widest uppercase">
            Introspected Foreign Keys • Cardinality Rules • Database Entity Topology
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="h-8 px-3 bg-[#0C1013] hover:bg-[#171E24] text-[#E6EDF3] border border-[#1C252C] rounded-[2px] text-xs flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin text-[#3ECF72]")} />
          <span>REFRESH GRAPH</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-[#2B1215] border border-[#6E2329] rounded-[2px] text-xs text-[#FCA5A5] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#F87171] shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4">
          <Panel title="Database Entities" code="ENT">
            <div className="space-y-1.5 max-h-[540px] overflow-y-auto custom-scrollbar text-xs">
              {tables.map((tbl) => {
                const isSelected = selectedEntity === tbl.name;
                const outgoingFks = relationships.filter((r) => r.source_table === tbl.name);
                const incomingFks = relationships.filter((r) => r.target_table === tbl.name);
                return (
                  <div
                    key={tbl.name}
                    onClick={() => setSelectedEntity(tbl.name)}
                    className={cn(
                      "p-3 rounded-[2px] border cursor-pointer transition-all flex flex-col gap-1",
                      isSelected
                        ? "bg-[#12271B]/50 border-[#3ECF72] text-[#E6EDF3]"
                        : "bg-[#080B0D] border-[#1C252C] text-[#8B98A5] hover:bg-[#11161B]"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Database className={cn("w-3.5 h-3.5", isSelected ? "text-[#4ADE80]" : "text-[#53616E]")} />
                        <span className="font-bold">{tbl.name}</span>
                      </div>
                      <span className="text-[10px] text-[#53616E]">{tbl.rows ?? 0} rows</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[#53616E]">
                      {tbl.primary_key && (
                        <span className="text-[#F59E0B] flex items-center gap-0.5">
                          <Key className="w-2.5 h-2.5" /> PK: {tbl.primary_key}
                        </span>
                      )}
                      <span>{tbl.columns?.length ?? 0} cols</span>
                    </div>
                    {(outgoingFks.length > 0 || incomingFks.length > 0) && (
                      <div className="flex items-center gap-3 pt-1 border-t border-[#141B21] text-[9px]">
                        {outgoingFks.length > 0 && <span className="text-[#38BDF8]">Outgoing: {outgoingFks.length}</span>}
                        {incomingFks.length > 0 && <span className="text-[#4ADE80]">Incoming: {incomingFks.length}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>

        <div className="lg:col-span-8">
          <Panel title={`Relational Topology // ${selectedEntity || "ALL"}`} code="FK-MAP" brackets className="min-h-[540px]">
            <div className="space-y-3 text-xs">
              {relationships
                .filter((r) => !selectedEntity || r.source_table === selectedEntity || r.target_table === selectedEntity)
                .map((rel) => (
                  <div key={rel.id} className="p-3.5 bg-[#080B0D] border border-[#1C252C] rounded-[2px] flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <Badge variant={rel.is_physical ? "green" : "gray"}>
                        {rel.is_physical ? "PHYSICAL FOREIGN KEY" : "LOGICAL RELATION"}
                      </Badge>
                      <span className="text-[10px] text-[#F59E0B]">Cardinality: {rel.cardinality || "N:1"}</span>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-[#0C1013] border border-[#1C252C] rounded-[2px]">
                      <div>
                        <span className="text-[10px] text-[#53616E] uppercase block">Child Entity</span>
                        <span className="font-bold text-sm text-[#E6EDF3]">{rel.source_table}</span>
                        <span className="text-[#F59E0B] text-[11px] block">{rel.source_column}</span>
                      </div>

                      <div className="flex flex-col items-center px-4">
                        <span className="text-[9px] text-[#53616E]">REFERENCES</span>
                        <ArrowRight className="w-4 h-4 text-[#4ADE80]" />
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-[#53616E] uppercase block">Parent Entity</span>
                        <span className="font-bold text-sm text-[#E6EDF3]">{rel.target_table}</span>
                        <span className="text-[#38BDF8] text-[11px] block">{rel.target_column}</span>
                      </div>
                    </div>

                    <p className="text-[11px] text-[#8B98A5]">{rel.description}</p>
                    <div className="text-[10px] text-[#53616E]">
                      Constraint: {rel.constraint_name} • ON DELETE: {rel.on_delete}
                    </div>
                  </div>
                ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
