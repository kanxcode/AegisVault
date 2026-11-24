import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { shouldReduceMotion, supportsWebGL } from "@/lib/motion";

export default function OrbitalComputeBackdrop() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fallbackMode, setFallbackMode] = useState(false);

  useEffect(() => {
    if (shouldReduceMotion() || !supportsWebGL()) {
      setFallbackMode(true);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let frameId = 0;

    try {
      const width = container.clientWidth || 640;
      const height = container.clientHeight || 260;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      camera.position.set(0, 0.6, 6.4);

      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(width, height);
      container.appendChild(renderer.domElement);

      // Subtle wireframe orbital core
      const icoGeo = new THREE.IcosahedronGeometry(1.75, 1);
      const icoWire = new THREE.WireframeGeometry(icoGeo);
      const icoMat = new THREE.LineBasicMaterial({
        color: 0x3ecf72,
        transparent: true,
        opacity: 0.16,
      });
      const coreMesh = new THREE.LineSegments(icoWire, icoMat);
      scene.add(coreMesh);

      // Outer orbital telemetry ring
      const ringGeo = new THREE.RingGeometry(2.35, 2.38, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.22,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2.6;
      scene.add(ringMesh);

      // Slowly moving telemetry points
      const pointCount = 85;
      const positions = new Float32Array(pointCount * 3);
      for (let i = 0; i < pointCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 2.2 + Math.random() * 2.1;
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
        positions[i * 3 + 2] = r * Math.cos(phi);
      }
      const ptGeo = new THREE.BufferGeometry();
      ptGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const ptMat = new THREE.PointsMaterial({
        color: 0x38bdf8,
        size: 0.045,
        transparent: true,
        opacity: 0.55,
      });
      const points = new THREE.Points(ptGeo, ptMat);
      scene.add(points);

      const handleResize = () => {
        if (!container || !renderer) return;
        const w = container.clientWidth || 640;
        const h = container.clientHeight || 260;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener("resize", handleResize);

      let lastTime = performance.now();
      const renderLoop = (now: number) => {
        frameId = requestAnimationFrame(renderLoop);
        if (document.hidden) {
          lastTime = now;
          return;
        }
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        coreMesh.rotation.y += dt * 0.12;
        coreMesh.rotation.x += dt * 0.05;
        ringMesh.rotation.z -= dt * 0.09;
        points.rotation.y -= dt * 0.04;

        renderer?.render(scene, camera);
      };
      frameId = requestAnimationFrame(renderLoop);

      return () => {
        cancelAnimationFrame(frameId);
        window.removeEventListener("resize", handleResize);
        icoGeo.dispose();
        icoWire.dispose();
        icoMat.dispose();
        ringGeo.dispose();
        ringMat.dispose();
        ptGeo.dispose();
        ptMat.dispose();
        if (renderer) {
          renderer.dispose();
          renderer.domElement.remove();
        }
      };
    } catch {
      setFallbackMode(true);
      if (renderer) renderer.dispose();
    }
  }, []);

  if (fallbackMode) {
    return (
      <div
        className="absolute inset-0 pointer-events-none opacity-35"
        style={{
          backgroundImage:
            "radial-gradient(circle at 80% 45%, rgba(62,207,114,0.12), transparent 55%), radial-gradient(circle at 20% 50%, rgba(56,189,248,0.08), transparent 50%)",
        }}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none opacity-85"
      aria-hidden="true"
    />
  );
}

