import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { shouldReduceMotion, supportsWebGL } from "@/lib/motion";

export interface TopologyNode {
  name: string;
  object_type?: string;
  rows: number;
  column_count?: number;
  columns?: string[];
  primary_key?: string | null;
}

export interface TopologyEdge {
  id: string;
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
  is_physical?: boolean;
}

interface SchemaTopology3DProps {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  selectedNode: string | null;
  onSelectNode: (name: string) => void;
  onInspectTable?: (name: string) => void;
}

export default function SchemaTopology3D({
  nodes,
  edges,
  selectedNode,
  onSelectNode,
  onInspectTable,
}: SchemaTopology3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const selectedRef = useRef(selectedNode);
  selectedRef.current = selectedNode;

  useEffect(() => {
    if (!supportsWebGL()) {
      setWebglUnavailable(true);
      return;
    }

    const container = mountRef.current;
    if (!container || nodes.length === 0) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let frameId = 0;

    try {
      const width = container.clientWidth || 720;
      const height = container.clientHeight || 460;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 120);
      let radius = 14;
      let theta = 0.6;
      let phi = 1.05;

      const updateCamera = () => {
        camera.position.x = radius * Math.sin(phi) * Math.sin(theta);
        camera.position.y = radius * Math.cos(phi);
        camera.position.z = radius * Math.sin(phi) * Math.cos(theta);
        camera.lookAt(0, 0, 0);
      };
      updateCamera();

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(width, height);
      container.appendChild(renderer.domElement);

      // Subtle reference grid floor
      const grid = new THREE.GridHelper(18, 18, 0x1c252c, 0x11161b);
      grid.position.y = -2.2;
      scene.add(grid);

      // Ambient + directional lighting
      const ambient = new THREE.AmbientLight(0xdbeafe, 0.8);
      scene.add(ambient);
      const dirLight = new THREE.DirectionalLight(0x4ade80, 0.9);
      dirLight.position.set(6, 10, 8);
      scene.add(dirLight);

      // Arrange nodes in deterministic circular/layered spatial layout
      const nodePositions = new Map<string, THREE.Vector3>();
      const count = nodes.length;
      nodes.forEach((n, idx) => {
        const angle = (idx / Math.max(1, count)) * Math.PI * 2;
        const r = n.object_type === "VIEW" ? 6.4 : 4.6;
        const y = n.object_type === "VIEW" ? 1.4 : ((idx % 3) - 1) * 0.7;
        nodePositions.set(n.name, new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r));
      });

      const disposables: { dispose: () => void }[] = [];
      const interactiveMeshes: THREE.Mesh[] = [];

      const tableGeo = new THREE.BoxGeometry(0.82, 0.56, 0.82);
      const viewGeo = new THREE.OctahedronGeometry(0.55, 0);
      disposables.push(tableGeo, viewGeo);

      const nodeMaterialMap = new Map<string, THREE.MeshStandardMaterial>();

      nodes.forEach((n) => {
        const pos = nodePositions.get(n.name)!;
        const isView = n.object_type === "VIEW";
        const isSel = n.name === selectedRef.current;

        const mat = new THREE.MeshStandardMaterial({
          color: isSel ? 0x3ecf72 : isView ? 0x38bdf8 : 0x1e3a4c,
          emissive: isSel ? 0x184e2e : isView ? 0x0f2d3d : 0x0a1922,
          metalness: 0.35,
          roughness: 0.45,
          wireframe: false,
        });
        disposables.push(mat);
        nodeMaterialMap.set(n.name, mat);

        const mesh = new THREE.Mesh(isView ? viewGeo : tableGeo, mat);
        mesh.position.copy(pos);
        mesh.userData = { tableName: n.name };
        scene.add(mesh);
        interactiveMeshes.push(mesh);

        // Wireframe accent border
        const wireGeo = new THREE.EdgesGeometry(isView ? viewGeo : tableGeo);
        const wireMat = new THREE.LineBasicMaterial({
          color: isView ? 0x38bdf8 : 0x3ecf72,
          transparent: true,
          opacity: isSel ? 0.95 : 0.45,
        });
        disposables.push(wireGeo, wireMat);
        const wire = new THREE.LineSegments(wireGeo, wireMat);
        mesh.add(wire);
      });

      // Foreign key edges
      edges.forEach((edge) => {
        const src = nodePositions.get(edge.source_table);
        const tgt = nodePositions.get(edge.target_table);
        if (!src || !tgt) return;

        const mid = src.clone().add(tgt).multiplyScalar(0.5);
        mid.y += 0.9;
        const curve = new THREE.QuadraticBezierCurve3(src, mid, tgt);
        const curveGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(20));
        const curveMat = new THREE.LineBasicMaterial({
          color: edge.is_physical ? 0x3ecf72 : 0xf59e0b,
          transparent: true,
          opacity: 0.7,
        });
        disposables.push(curveGeo, curveMat);
        scene.add(new THREE.Line(curveGeo, curveMat));
      });

      // Mouse orbit & raycast selection
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let isDragging = false;
      let dragMoved = false;
      let prevX = 0;
      let prevY = 0;

      const onPointerDown = (e: PointerEvent) => {
        isDragging = true;
        dragMoved = false;
        prevX = e.clientX;
        prevY = e.clientY;
      };

      const onPointerMove = (e: PointerEvent) => {
        const rect = renderer!.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        if (isDragging) {
          const dx = e.clientX - prevX;
          const dy = e.clientY - prevY;
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
          theta -= dx * 0.008;
          phi = Math.min(Math.PI / 2 - 0.08, Math.max(0.25, phi - dy * 0.008));
          prevX = e.clientX;
          prevY = e.clientY;
          updateCamera();
          return;
        }

        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(interactiveMeshes, false);
        const hitName = hits[0]?.object?.userData?.tableName || null;
        setHoveredName(hitName);
        renderer!.domElement.style.cursor = hitName ? "pointer" : "grab";
      };

      const onPointerUp = (e: PointerEvent) => {
        if (!dragMoved) {
          const rect = renderer!.domElement.getBoundingClientRect();
          pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);
          const hits = raycaster.intersectObjects(interactiveMeshes, false);
          const hitName = hits[0]?.object?.userData?.tableName;
          if (hitName) {
            onSelectNode(hitName);
          }
        }
        isDragging = false;
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        radius = Math.min(24, Math.max(6, radius + e.deltaY * 0.01));
        updateCamera();
      };

      const domEl = renderer.domElement;
      domEl.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      domEl.addEventListener("wheel", onWheel, { passive: false });

      const onResize = () => {
        if (!container || !renderer) return;
        const w = container.clientWidth || 720;
        const h = container.clientHeight || 460;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener("resize", onResize);

      const reduceMotion = shouldReduceMotion();
      let lastTime = performance.now();

      const tick = (now: number) => {
        frameId = requestAnimationFrame(tick);
        if (document.hidden) {
          lastTime = now;
          return;
        }
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        if (!reduceMotion && !isDragging) {
          theta += dt * 0.06;
          updateCamera();
        }

        nodeMaterialMap.forEach((mat, name) => {
          const isSel = name === selectedRef.current;
          const isView = nodes.find((n) => n.name === name)?.object_type === "VIEW";
          mat.color.setHex(isSel ? 0x3ecf72 : isView ? 0x38bdf8 : 0x1e3a4c);
          mat.emissive.setHex(isSel ? 0x184e2e : isView ? 0x0f2d3d : 0x0a1922);
        });

        renderer?.render(scene, camera);
      };
      frameId = requestAnimationFrame(tick);

      return () => {
        cancelAnimationFrame(frameId);
        domEl.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        domEl.removeEventListener("wheel", onWheel);
        window.removeEventListener("resize", onResize);
        disposables.forEach((d) => d.dispose());
        if (renderer) {
          renderer.dispose();
          domEl.remove();
        }
      };
    } catch {
      setWebglUnavailable(true);
      if (renderer) renderer.dispose();
    }
  }, [nodes, edges, onSelectNode]);

  if (webglUnavailable) {
    return (
      <div className="p-8 text-center font-mono text-xs text-[#8B98A5] bg-[#080B0D] border border-[#1C252C] rounded-[2px]">
        WebGL is unavailable on this device. Switch to the 2D Interactive Schema Graph for full zoom, pan, and relationship inspection.
      </div>
    );
  }

  const activeObj = nodes.find((n) => n.name === (hoveredName || selectedNode));

  return (
    <div className="relative w-full h-[460px] bg-[#050708] border border-[#1C252C] rounded-[2px] overflow-hidden">
      <div ref={mountRef} className="w-full h-full" />

      {/* Spatial HUD Overlay */}
      <div className="absolute top-3 left-3 pointer-events-none font-mono text-[10px] space-y-1 bg-[#080B0D]/85 border border-[#1C252C] px-2.5 py-2 rounded-[2px]">
        <div className="text-[#4ADE80] font-bold">3D DATABASE TOPOLOGY // DRAG ORBIT · SCROLL ZOOM · CLICK NODE</div>
        <div className="flex items-center gap-3 text-[#8B98A5]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-[#1E3A4C] border border-[#3ECF72]" /> TABLE</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-[#38BDF8]" /> VIEW</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#3ECF72]" /> PHYSICAL FK</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#F59E0B]" /> LOGICAL REL</span>
        </div>
      </div>

      {activeObj && (
        <div className="absolute bottom-3 right-3 bg-[#0C1013]/95 border border-[#2A3844] p-3 rounded-[2px] font-mono text-xs min-w-[220px] space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-[#4ADE80]">{activeObj.name}</span>
            <span className="text-[9px] px-1.5 py-0.5 bg-[#0F2430] border border-[#1E4B63] text-[#38BDF8] rounded-[2px]">
              {activeObj.object_type || "TABLE"}
            </span>
          </div>
          <div className="text-[10px] text-[#8B98A5]">
            {activeObj.column_count ?? activeObj.columns?.length ?? 0} cols · {activeObj.rows ?? 0} rows
            {activeObj.primary_key ? ` · PK: ${activeObj.primary_key}` : ""}
          </div>
          {onInspectTable && (
            <button
              onClick={() => onInspectTable(activeObj.name)}
              className="w-full h-7 mt-1 bg-[#12271B] hover:bg-[#183525] border border-[#265438] text-[#4ADE80] text-[10px] font-bold rounded-[2px] cursor-pointer"
            >
              OPEN SCHEMA &amp; RECORDS →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

