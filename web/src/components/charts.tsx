import React, { useState } from "react";

/**
 * Hand-rolled SVG charts per the dataviz mark specs: bars <=24px with 4px
 * rounded data-ends (square at the baseline), 2px lines, >=8px end markers
 * with a 2px surface ring, hairline gridlines, direct labels in ink tokens
 * (text never wears the series color), and hover tooltips on every mark.
 */

const SURFACE = "#ffffff";
const INK = "#16151d";
const INK2 = "#565264";
const MUTED = "#8b8797";
const GRID = "rgba(22,21,29,0.09)";

// ---------------------------------------------------------------- BarList
export interface BarDatum { label: string; value: number; color: string; sub?: string; }

export function BarList({ data, unit = "CYCLE", height = 26 }: { data: BarDatum[]; unit?: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1e-9);
  return (
    <div>
      {data.map((d, i) => {
        const w = Math.max(0.5, (d.value / max) * 100);
        return (
          <div
            key={d.label}
            style={{ display: "grid", gridTemplateColumns: "110px 1fr 74px", gap: 8, alignItems: "center", height, position: "relative" }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span style={{ fontSize: 11, color: INK2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>
            <div style={{ position: "relative", height: 14 }}>
              <div style={{ position: "absolute", inset: 0, borderLeft: `1px solid ${GRID}` }} />
              <div
                style={{
                  position: "absolute", left: 0, top: 0, bottom: 0, width: `${w}%`,
                  background: d.color, borderRadius: "0 4px 4px 0", // rounded data-end, square baseline
                  opacity: hover === null || hover === i ? 1 : 0.45,
                  transition: "width 400ms ease, opacity 150ms",
                }}
              />
            </div>
            <span className="mono" style={{ fontSize: 11, color: INK, textAlign: "right" }}>
              {d.value >= 1000 ? Math.round(d.value).toLocaleString("en-US") : d.value.toFixed(1)}
            </span>
            {hover === i && (
              <div style={tooltipStyle}>
                <b style={{ color: INK }}>{d.label}</b> · {d.value.toLocaleString("en-US", { maximumFractionDigits: 2 })} {unit}
                {d.sub ? <span style={{ color: MUTED }}> · {d.sub}</span> : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const tooltipStyle: React.CSSProperties = {
  position: "absolute", top: -30, left: 110, zIndex: 10,
  background: "#ffffff", border: "1px solid rgba(22,21,29,0.14)", borderRadius: 8,
  padding: "4px 10px", fontSize: 11, color: INK2, whiteSpace: "nowrap", pointerEvents: "none",
  boxShadow: "0 8px 24px rgba(22,21,29,0.14)",
};

// -------------------------------------------------------------- Sparkline
export function Sparkline({ points, color = "#2a78d6", height = 72, format = (v: number) => v.toFixed(1) }:
  { points: Array<{ t: number; v: number }>; color?: string; height?: number; format?: (v: number) => string }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const W = 320, H = height, PAD = 6;
  if (points.length < 2) {
    return <div style={{ height: H, display: "flex", alignItems: "center", color: MUTED, fontSize: 11 }}>collecting data…</div>;
  }
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs), max = Math.max(...vs);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - 2 * PAD);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${path} L${x(points.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;
  const last = points[points.length - 1];
  const hi = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        onMouseMove={(e) => {
          const rect = (e.target as SVGElement).closest("svg")!.getBoundingClientRect();