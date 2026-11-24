import { useEffect, useState, type RefObject } from "react";
import { useStore } from "./store";

export function shouldReduceMotion(): boolean {
  const pref = useStore.getState().settings.reducedMotion;
  if (pref === "reduce") return true;
  if (pref === "allow") return false;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  return false;
}

export function supportsWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    return Boolean(gl);
  } catch {
    return false;
  }
}

export function useScrollProgress(containerRef?: RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const el =
      containerRef?.current ||
      (document.querySelector("main") as HTMLElement | null);
    if (!el) return;

    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const max = el.scrollHeight - el.clientHeight;
        setScrollY(el.scrollTop);
        setProgress(max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0);
      });
    };

    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [containerRef]);

  return { progress, scrollY };
}

