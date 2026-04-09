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
    let cancelled = false;

    const uid = `mermaid-${Date.now()}-${idCounter++}`;

    const renderTarget = document.createElement("div");
    renderTarget.id = uid;
    renderTarget.style.visibility = "hidden";
    renderTarget.style.position = "absolute";
    renderTarget.style.width = "0";
    renderTarget.style.height = "0";
    renderTarget.style.overflow = "hidden";
    document.body.appendChild(renderTarget);

    (async () => {
      try {
        const { svg } = await mermaid.render(uid, chart);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          const svgEl = ref.current.querySelector("svg");
          if (svgEl) {
            svgEl.style.minWidth = "800px";
            svgEl.style.width = "100%";
            svgEl.style.height = "auto";
            svgEl.removeAttribute("height");
          }
        }
      } catch {
        if (!cancelled && ref.current) {
          ref.current.innerHTML = `<pre style="color:#f66">${chart}</pre>`;
        }
      } finally {
        renderTarget.remove();
      }
    })();

    return () => {
      cancelled = true;
      container.innerHTML = "";
      renderTarget.remove();
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
