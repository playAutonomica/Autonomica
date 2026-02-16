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
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const idx = Math.round(((px - PAD) / (W - 2 * PAD)) * (points.length - 1));
          setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke={GRID} strokeWidth="1" />
        <path d={area} fill={color} opacity="0.1" />
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hi !== null && hoverIdx !== null && (
          <line x1={x(hoverIdx)} y1={PAD} x2={x(hoverIdx)} y2={H - PAD} stroke={MUTED} strokeWidth="1" />
        )}
        {/* end marker: >=8px dot with a 2px surface ring */}
        <circle cx={x(points.length - 1)} cy={y(last.v)} r="5" fill={color} stroke={SURFACE} strokeWidth="2" />
        {hi !== null && hoverIdx !== null && (
          <circle cx={x(hoverIdx)} cy={y(hi.v)} r="5" fill={color} stroke={SURFACE} strokeWidth="2" />
        )}
      </svg>
      <span className="mono" style={{ position: "absolute", right: 0, top: -2, fontSize: 11, color: INK }}>
        {format((hi ?? last).v)}
      </span>
      {hi && (
        <span style={{ position: "absolute", left: 0, top: -2, fontSize: 11, color: MUTED }}>
          {new Date(hi.t).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Meter
export function Meter({ fraction, label }: { fraction: number; label: string }) {
  const pct = Math.round(fraction * 100);
  return (
    <div title={`${pct}% utilized`}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: INK2 }}>{label}</span>
        <span className="mono" style={{ color: INK }}>{pct}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "#cde2fb", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: "#2a78d6", borderRadius: "0 4px 4px 0", transition: "width 400ms ease" }} />
      </div>
    </div>
  );
}
