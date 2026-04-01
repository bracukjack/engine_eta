"use client";

import { useState, useRef, useEffect } from "react";

/** Mount once in the root layout — listens globally via document delegation. */
export function DataTooltip() {
  const [state, setState] = useState<{ text: string; visible: boolean }>({
    text: "",
    visible: false,
  });
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
      if (!el) return;
      const tip = el.dataset.tip ?? "";
      if (!tip) return;
      // Clone without overflow to measure natural text width
      const clone = el.cloneNode(true) as HTMLElement;
      clone.setAttribute(
        "style",
        "position:fixed;visibility:hidden;top:-9999px;left:-9999px;" +
          "overflow:visible;width:auto;max-width:none;white-space:nowrap;display:inline-block;"
      );
      document.body.appendChild(clone);
      const naturalWidth = clone.offsetWidth;
      document.body.removeChild(clone);
      if (naturalWidth <= el.offsetWidth) return;
      setState({ text: tip, visible: true });
    };

    const onOut = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
      if (!el) return;
      if (el.contains(e.relatedTarget as Node)) return;
      setState((s) => ({ ...s, visible: false }));
    };

    const onMove = (e: MouseEvent) => {
      if (!divRef.current) return;
      divRef.current.style.left = `${e.clientX + 14}px`;
      divRef.current.style.top = `${e.clientY + 16}px`;
    };

    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseout", onOut, true);
    document.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("mouseout", onOut, true);
      document.removeEventListener("mousemove", onMove);
    };
  }, []);

  if (!state.visible || !state.text) return null;

  return (
    <div
      ref={divRef}
      style={{ position: "fixed", top: 0, left: 0, zIndex: 9999 }}
      className="bg-gray-900 text-white text-[11px] font-mono px-2.5 py-1 rounded-md shadow-xl max-w-sm pointer-events-none break-all"
    >
      {state.text}
    </div>
  );
}

/** Call on double-click: shows a floating "✓ Copied" pill near cursor. */
export function showCopiedToast(x: number, y: number) {
  const el = document.createElement("div");
  el.textContent = "✓ Copied";
  Object.assign(el.style, {
    position: "fixed",
    top: `${y - 36}px`,
    left: `${x}px`,
    transform: "translateX(-50%)",
    background: "#16a34a",
    color: "white",
    fontSize: "11px",
    fontFamily: "monospace",
    padding: "3px 12px",
    borderRadius: "20px",
    zIndex: "9999",
    pointerEvents: "none",
    transition: "opacity 0.4s ease, transform 0.5s ease",
  });
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(-50%) translateY(-14px)";
  }, 400);
  setTimeout(() => el.remove(), 900);
}
