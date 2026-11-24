import { useState, useMemo, useRef, useEffect } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Key, ArrowRight, Eye, Table as TableIcon } from "lucide-react";
import { animate } from "animejs";
import { shouldReduceMotion } from "@/lib/motion";
import { Badge } from "@/components/ui/Badge";
import type { TopologyNode, TopologyEdge } from "@/components/three/SchemaTopology3D";

interface SchemaGraph2DProps {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  selectedNode: string | null;
  onSelectNode: (name: string) => void;
  onNavigateStructure: (name: string) => void;
  onNavigateRecords: (name: string) => void;
}

const GRAPH_WIDTH = 920;
const GRAPH_HEIGHT = 480;
const GRAPH_CX = GRAPH_WIDTH / 2;
const GRAPH_CY = GRAPH_HEIGHT / 2;

export function SchemaGraph2D({
  nodes,
  edges,
  selectedNode,
  onSelectNode,
  onNavigateStructure,
  onNavigateRecords,
}: SchemaGraph2DProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [selectedEdge, setSelectedEdge] = useState<TopologyEdge | null>(null);
  const dragOrigin = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const layout = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const total = nodes.length;
    if (total === 0) return map;

    nodes.forEach((n, idx) => {
      const angle = (idx / total) * Math.PI * 2 - Math.PI / 2;
      const rx = total > 8 ? 330 : 270;
      const ry = total > 8 ? 185 : 155;
      map.set(n.name, {
        x: GRAPH_CX + Math.cos(angle) * rx,
        y: GRAPH_CY + Math.sin(angle) * ry,
      });
    });
    return map;
  }, [nodes]);

  useEffect(() => {
    if (shouldReduceMotion() || !svgRef.current) return;
    const paths = svgRef.current.querySelectorAll(".fk-edge-animated");
    if (paths.length === 0) return;
    const anim = animate(paths, {
      strokeDashoffset: [24, 0],
      duration: 1400,
      ease: "linear",
      loop: true,
    });
    return () => {
      anim.pause();
    };
  }, [edges, nodes]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-node]")) return;
    setDragging(true);
    dragOrigin.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setPan({
      x: dragOrigin.current.panX + (e.clientX - dragOrigin.current.x),
      y: dragOrigin.current.panY + (e.clientY - dragOrigin.current.y),
    });
  };

  const handleMouseUp = () => setDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(2.2, Math.max(0.5, Number((z - e.deltaY * 0.001).toFixed(2)))));
  };

  const activeNodeObj = nodes.find((n) => n.name === selectedNode);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#080B0D] border border-[#1C252C] p-2 rounded-[2px] font-mono text-[10px]">
        <div className="flex items-center gap-3 text-[#8B98A5]">
          <span className="text-[#4ADE80] font-bold">2D SCHEMA TOPOLOGY</span>
          <span>DRAG CANVAS TO PAN • SCROLL OR BUTTONS TO ZOOM • CLICK NODE OR EDGE</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))}
            className="h-7 w-7 bg-[#0C1013] hover:bg-[#171E24] border border-[#1C252C] text-[#E6EDF3] rounded-[2px] flex items-center justify-center cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="px-2 text-[#38BDF8] tabular-nums">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.15).toFixed(2))))}
            className="h-7 w-7 bg-[#0C1013] hover:bg-[#171E24] border border-[#1C252C] text-[#E6EDF3] rounded-[2px] flex items-center justify-center cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="h-7 px-2 bg-[#0C1013] hover:bg-[#171E24] border border-[#1C252C] text-[#8B98A5] hover:text-[#E6EDF3] rounded-[2px] flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" /> RESET
          </button>
        </div>
      </div>

      {/* Interactive SVG Canvas */}
      <div
        className="relative w-full h-[460px] bg-[#050708] border border-[#1C252C] rounded-[2px] overflow-hidden select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: dragging ? "grabbing" : "grab" }}
      >
        <svg ref={svgRef} viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} className="w-full h-full">
          <defs>
            <marker id="fk-arrow-green" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#3ECF72" />
            </marker>
            <marker id="fk-arrow-amber" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#F59E0B" />
            </marker>
          </defs>

          <g transform={`translate(${pan.x + GRAPH_CX * (1 - zoom)}, ${pan.y + GRAPH_CY * (1 - zoom)}) scale(${zoom})`}>
            {/* Edges */}
            {edges.map((edge) => {
              const s = layout.get(edge.source_table);
              const t = layout.get(edge.target_table);
              if (!s || !t) return null;

              const isHighlighted =
                selectedEdge?.id === edge.id ||
                selectedNode === edge.source_table ||
                selectedNode === edge.target_table;

              const mx = (s.x + t.x) / 2;
              const my = (s.y + t.y) / 2 - 28;

              return (
                <g
                  key={edge.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedEdge(edge);
                  }}
                  className="cursor-pointer"
                >
                  <path
                    d={`M ${s.x} ${s.y} Q ${mx} ${my} ${t.x} ${t.y}`}
                    fill="none"
                    stroke={edge.is_physical ? "#3ECF72" : "#F59E0B"}
                    strokeWidth={isHighlighted ? 2.2 : 1.2}
                    strokeOpacity={isHighlighted ? 0.95 : 0.32}
                    strokeDasharray="6 4"
                    className={isHighlighted ? "fk-edge-animated" : undefined}
                    markerEnd={edge.is_physical ? "url(#fk-arrow-green)" : "url(#fk-arrow-amber)"}
                  />
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const pos = layout.get(node.name);
              if (!pos) return null;
              const isSelected = selectedNode === node.name;
              const isView = node.object_type === "VIEW";
              const boxW = 132;
              const boxH = 44;

              return (
                <g
                  key={node.name}
                  data-node="true"
                  transform={`translate(${pos.x - boxW / 2}, ${pos.y - boxH / 2})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectNode(node.name);
                  }}
                  className="cursor-pointer"
                >
                  <rect
                    width={boxW}
                    height={boxH}
                    rx={2}
                    fill={isSelected ? "#12271B" : isView ? "#0F2430" : "#0C1013"}
                    stroke={isSelected ? "#3ECF72" : isView ? "#38BDF8" : "#2A3844"}
                    strokeWidth={isSelected ? 1.8 : 1}
                  />
                  <text
                    x={10}
                    y={18}
                    fill={isSelected ? "#4ADE80" : "#E6EDF3"}
                    fontSize="11"
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {node.name.length > 15 ? `${node.name.slice(0, 14)}…` : node.name}
                  </text>
                  <text
                    x={10}
                    y={34}
                    fill={isView ? "#38BDF8" : "#8B98A5"}
                    fontSize="9"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {isView ? "VIEW" : "TABLE"} · {node.rows}r · {node.column_count ?? node.columns?.length ?? 0}c
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Selected Node or Edge Inspector */}
      {(activeNodeObj || selectedEdge) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
          {activeNodeObj && (
            <div className="p-3 bg-[#080B0D] border border-[#1C252C] rounded-[2px] flex items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  {activeNodeObj.object_type === "VIEW" ? (
                    <Eye className="w-3.5 h-3.5 text-[#38BDF8]" />
                  ) : (
                    <TableIcon className="w-3.5 h-3.5 text-[#4ADE80]" />
                  )}
                  <span className="font-bold text-[#E6EDF3] truncate">{activeNodeObj.name}</span>
                  <Badge variant={activeNodeObj.object_type === "VIEW" ? "cyan" : "green"}>
                    {activeNodeObj.object_type || "TABLE"}
                  </Badge>
                </div>
                <div className="text-[10px] text-[#8B98A5] flex items-center gap-3">
                  <span>{activeNodeObj.column_count ?? activeNodeObj.columns?.length ?? 0} columns</span>
                  <span>{activeNodeObj.rows} records</span>
                  {activeNodeObj.primary_key && (
                    <span className="text-[#F59E0B] flex items-center gap-1">
                      <Key className="w-2.5 h-2.5" /> {activeNodeObj.primary_key}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => onNavigateStructure(activeNodeObj.name)}
                  className="px-2.5 py-1 bg-[#11161B] hover:bg-[#171E24] border border-[#1C252C] text-[10px] text-[#E6EDF3] rounded-[2px] cursor-pointer"
                >
                  SCHEMA
                </button>
                <button
                  onClick={() => onNavigateRecords(activeNodeObj.name)}
                  className="px-2.5 py-1 bg-[#12271B] hover:bg-[#183525] border border-[#265438] text-[10px] text-[#4ADE80] rounded-[2px] cursor-pointer"
                >
                  RECORDS
                </button>
              </div>
            </div>
          )}

          {selectedEdge && (
            <div className="p-3 bg-[#080B0D] border border-[#1C252C] rounded-[2px] space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#F59E0B] font-bold">SELECTED RELATIONSHIP</span>
                <Badge variant={selectedEdge.is_physical ? "green" : "amber"}>
                  {selectedEdge.is_physical ? "PHYSICAL FK" : "LOGICAL"}
                </Badge>
              </div>
              <div className="text-xs text-[#E6EDF3] flex items-center gap-2">
                <span>
                  {selectedEdge.source_table}.<strong className="text-[#F59E0B]">{selectedEdge.source_column}</strong>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-[#4ADE80]" />
                <span>
                  {selectedEdge.target_table}.<strong className="text-[#38BDF8]">{selectedEdge.target_column}</strong>
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

