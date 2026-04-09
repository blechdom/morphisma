import { useEffect, useRef } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    primaryColor: "#2a2a2a",
    primaryTextColor: "#ccc",
    primaryBorderColor: "#555",
    lineColor: "#888",
    secondaryColor: "#1e1e1e",
    tertiaryColor: "#333",
    fontFamily: "monospace",
    fontSize: "14px",
  },
  flowchart: { curve: "basis", padding: 16, nodeSpacing: 30, rankSpacing: 40 },
});

let idCounter = 0;

export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const container = ref.current;
    container.innerHTML = "";
    const uid = `mermaid-${Date.now()}-${idCounter++}`;
    mermaid.render(uid, chart).then(({ svg }) => {
      container.innerHTML = svg;
      const svgEl = container.querySelector("svg");
      if (svgEl) {
        svgEl.style.minWidth = "800px";
        svgEl.style.width = "100%";
        svgEl.style.height = "auto";
        svgEl.removeAttribute("height");
      }
    }).catch((err) => {
      console.error("Mermaid render error:", err);
      container.innerHTML = `<pre style="color:#f66">${chart}</pre>`;
    });

    return () => {
      const stale = document.getElementById(uid);
      if (stale) stale.remove();
    };
  }, [chart]);

  return (
    <div
      ref={ref}
      style={{
        background: "#111",
        borderRadius: "6px",
        padding: "0.75rem",
        marginTop: "1.5rem",
        overflow: "auto",
      }}
    />
  );
}
