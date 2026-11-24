import { useState } from "react";
import { api } from "@/lib/api";
import type { CpuComparisonData, MemoryComparisonData, DiskComparisonData } from "@/types/trace";
import { Badge } from "@/components/ui/Badge";
import { BarChart3, Award, Layers, Info, Loader2 } from "lucide-react";

interface AlgorithmComparisonProps {
  moduleType: "cpu" | "memory" | "disk";
  defaultPayload: any;
  onApplyAlgorithm?: (algorithm: string) => void;
  className?: string;
}

export function AlgorithmComparison({
  moduleType,
  defaultPayload,
  onApplyAlgorithm,
  className = "",
}: AlgorithmComparisonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cpuData, setCpuData] = useState<CpuComparisonData | null>(null);
  const [memoryData, setMemoryData] = useState<MemoryComparisonData | null>(null);
  const [diskData, setDiskData] = useState<DiskComparisonData | null>(null);

  const runComparison = async () => {
    setLoading(true);
    setError(null);
    try {
      if (moduleType === "cpu") {
        setCpuData(await api.compareCpu(defaultPayload));
      } else if (moduleType === "memory") {
        setMemoryData(await api.compareMemory(defaultPayload));
      } else if (moduleType === "disk") {
        setDiskData(await api.compareDisk(defaultPayload));
      }
    } catch (err: any) {
      setError(err?.message || "Failed to execute algorithm comparison.");
    } finally {
      setLoading(false);
    }
  };

  const hasData = cpuData || memoryData || diskData;

  return (
    <div className={`bg-[#0C1013] border border-[#1C252C] rounded-[2px] flex flex-col overflow-hidden ${className}`}>
      <div className="px-3.5 py-2.5 bg-[#080B0D] border-b border-[#1C252C] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-[#F59E0B]" />
          <h3 className="font-mono text-xs font-semibold tracking-wider text-[#C5D1DC] uppercase">
            MULTI-ALGORITHM COMPARISON BENCHMARK
          </h3>
          <Badge variant="amber">IDENTICAL WORKLOAD</Badge>
        </div>

        <button
          onClick={runComparison}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1 bg-[#281E0E] hover:bg-[#35250E] border border-[#594019] text-[#F59E0B] font-mono text-xs font-semibold rounded-[2px] transition-colors disabled:opacity-50 cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>EVALUATING...</span>
            </>
          ) : (
            <>
              <Layers className="w-3 h-3" />
              <span>RUN BENCHMARK</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-[#2A1215] border-b border-[#5B2329] text-[#F87171] font-mono text-xs">
          ERROR: {error}
        </div>
      )}

      {!hasData && !loading && (
        <div className="p-4 text-center font-mono text-xs text-[#53616E]">
          Click "RUN BENCHMARK" to evaluate this workload across all supported algorithms simultaneously.
        </div>
      )}

      {cpuData && (
        <div className="p-3.5 space-y-3 font-mono">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] text-left border-collapse tabular-nums">
              <thead>
                <tr className="border-b border-[#1C252C] text-[#53616E] uppercase text-[10px]">
                  <th className="py-1.5 px-2">Algorithm</th>
                  <th className="py-1.5 px-2">Avg Wait</th>
                  <th className="py-1.5 px-2">Avg Turnaround</th>
                  <th className="py-1.5 px-2">Avg Response</th>
                  <th className="py-1.5 px-2">CPU Util</th>
                  <th className="py-1.5 px-2">Makespan</th>
                  <th className="py-1.5 px-2">Switches</th>
                  {onApplyAlgorithm && <th className="py-1.5 px-2 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#141B21]">
                {cpuData.comparison_table.map((row) => {
                  const isBestWait = row.algorithm === cpuData.best_waiting_algorithm;
                  const isBestResp = row.algorithm === cpuData.best_response_algorithm;
                  return (
                    <tr key={row.algorithm} className={`hover:bg-[#11161B] ${isBestWait ? "bg-[#12271B]/35" : ""}`}>
                      <td className="py-2 px-2 font-bold text-[#E6EDF3] flex items-center gap-1.5">
                        <span>{row.algorithm}</span>
                        {isBestWait && <Award className="w-3 h-3 text-[#4ADE80]" />}
                      </td>
                      <td className={`py-2 px-2 ${isBestWait ? "text-[#4ADE80] font-bold" : "text-[#8B98A5]"}`}>
                        {row.average_waiting_time} ms
                      </td>
                      <td className="py-2 px-2 text-[#8B98A5]">{row.average_turnaround_time} ms</td>
                      <td className={`py-2 px-2 ${isBestResp ? "text-[#38BDF8] font-bold" : "text-[#8B98A5]"}`}>
                        {row.average_response_time} ms
                      </td>
                      <td className="py-2 px-2 text-[#8B98A5]">{row.cpu_utilization}%</td>
                      <td className="py-2 px-2 text-[#8B98A5]">{row.makespan} ms</td>
                      <td className="py-2 px-2 text-[#8B98A5]">{row.context_switches}</td>
                      {onApplyAlgorithm && (
                        <td className="py-2 px-2 text-right">
                          <button
                            onClick={() => onApplyAlgorithm(row.algorithm)}
                            className="px-2 py-0.5 text-[10px] bg-[#11161B] hover:bg-[#171E24] text-[#E6EDF3] rounded-[2px] border border-[#1C252C] cursor-pointer"
                          >
                            Select
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="bg-[#080B0D] border border-[#1C252C] rounded-[2px] p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-[#F59E0B] font-bold uppercase mb-1">
              <Info className="w-3 h-3" />
              <span>ARCHITECTURAL TRADE-OFF ANALYSIS</span>
            </div>
            <p className="text-xs text-[#C5D1DC] leading-relaxed">{cpuData.tradeoff_analysis}</p>
          </div>
        </div>
      )}

      {memoryData && (
        <div className="p-3.5 space-y-3 font-mono">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] text-left border-collapse tabular-nums">
              <thead>
                <tr className="border-b border-[#1C252C] text-[#53616E] uppercase text-[10px]">
                  <th className="py-1.5 px-2">Algorithm</th>
                  <th className="py-1.5 px-2">Allocated</th>
                  <th className="py-1.5 px-2">Free</th>
                  <th className="py-1.5 px-2">Fragmentation</th>
                  <th className="py-1.5 px-2">Placed</th>
                  <th className="py-1.5 px-2">Unallocated</th>
                  {onApplyAlgorithm && <th className="py-1.5 px-2 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#141B21]">
                {memoryData.comparison_table.map((row) => (
                  <tr key={row.algorithm} className="hover:bg-[#11161B]">
                    <td className="py-2 px-2 font-bold text-[#E6EDF3]">{row.algorithm}</td>
                    <td className="py-2 px-2 text-[#4ADE80] font-semibold">{row.allocated_memory} MB</td>
                    <td className="py-2 px-2 text-[#8B98A5]">{row.free_memory} MB</td>
                    <td className="py-2 px-2 text-[#F59E0B]">{row.fragmentation} MB</td>
                    <td className="py-2 px-2 text-[#E6EDF3]">
                      {row.successful_allocations} / {row.successful_allocations + row.unallocated_count}
                    </td>
                    <td className="py-2 px-2 text-[#F87171]">
                      {row.unallocated_pids.length > 0 ? row.unallocated_pids.join(", ") : "None"}
                    </td>
                    {onApplyAlgorithm && (
                      <td className="py-2 px-2 text-right">
                        <button
                          onClick={() => onApplyAlgorithm(row.algorithm)}
                          className="px-2 py-0.5 text-[10px] bg-[#11161B] hover:bg-[#171E24] text-[#E6EDF3] rounded-[2px] border border-[#1C252C] cursor-pointer"
                        >
                          Select
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-[#080B0D] border border-[#1C252C] rounded-[2px] p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-[#F59E0B] font-bold uppercase mb-1">
              <Info className="w-3 h-3" />
              <span>ALLOCATION TRADE-OFF ANALYSIS</span>
            </div>
            <p className="text-xs text-[#C5D1DC] leading-relaxed">{memoryData.tradeoff_analysis}</p>
          </div>
        </div>
      )}

      {diskData && (
        <div className="p-3.5 space-y-3 font-mono">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] text-left border-collapse tabular-nums">
              <thead>
                <tr className="border-b border-[#1C252C] text-[#53616E] uppercase text-[10px]">
                  <th className="py-1.5 px-2">Algorithm</th>
                  <th className="py-1.5 px-2">Total Movement</th>
                  <th className="py-1.5 px-2">Avg Seek</th>
                  <th className="py-1.5 px-2">Service Order</th>
                  {onApplyAlgorithm && <th className="py-1.5 px-2 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#141B21]">
                {diskData.comparison_table.map((row) => {
                  const isBest = row.algorithm === diskData.best_movement_algorithm;
                  return (
                    <tr key={row.algorithm} className={`hover:bg-[#11161B] ${isBest ? "bg-[#12271B]/35" : ""}`}>
                      <td className="py-2 px-2 font-bold text-[#E6EDF3] flex items-center gap-1.5">
                        <span>{row.algorithm}</span>
                        {isBest && <Award className="w-3 h-3 text-[#4ADE80]" />}
                      </td>
                      <td className={`py-2 px-2 ${isBest ? "text-[#4ADE80] font-bold" : "text-[#8B98A5]"}`}>
                        {row.total_head_movement} cyl
                      </td>
                      <td className="py-2 px-2 text-[#8B98A5]">{row.average_seek_distance} cyl/req</td>
                      <td className="py-2 px-2 text-[#8B98A5] text-[10px] truncate max-w-[200px]">
                        {row.service_order.join(" → ")}
                      </td>
                      {onApplyAlgorithm && (
                        <td className="py-2 px-2 text-right">
                          <button
                            onClick={() => onApplyAlgorithm(row.algorithm)}
                            className="px-2 py-0.5 text-[10px] bg-[#11161B] hover:bg-[#171E24] text-[#E6EDF3] rounded-[2px] border border-[#1C252C] cursor-pointer"
                          >
                            Select
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="bg-[#080B0D] border border-[#1C252C] rounded-[2px] p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-[#F59E0B] font-bold uppercase mb-1">
              <Info className="w-3 h-3" />
              <span>SEEK TRAVERSAL TRADE-OFF ANALYSIS</span>
            </div>
            <p className="text-xs text-[#C5D1DC] leading-relaxed">{diskData.tradeoff_analysis}</p>
          </div>
        </div>
      )}
    </div>
  );
}
