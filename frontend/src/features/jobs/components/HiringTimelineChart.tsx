"use client";

import { useState } from "react";
import type { CompanyMonthlyStat } from "../jobs.type";

interface HiringTimelineChartProps {
  stats: CompanyMonthlyStat[];
  companyName: string;
}

function formatMonthShort(ym: string): string {
  const parts = ym.split("-");
  return parts.length === 2 ? `${parts[1]}/${parts[0].slice(2)}` : ym;
}

export default function HiringTimelineChart({
  stats,
  companyName,
}: HiringTimelineChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const totalOpenings = stats.reduce((sum, item) => sum + item.jobCount, 0);

  if (stats.length === 0 || totalOpenings === 0) {
    return (
      <div className="flex h-52 flex-col items-center justify-center rounded-2xl border border-neutral-500/60 bg-overlay/5 px-4 text-center">
        <p className="text-sm font-medium text-neutral-100">
          No hiring activity recorded
        </p>
        <p className="mt-1 text-xs text-neutral-300">
          {companyName} has no tracked openings over the last 12 months.
        </p>
      </div>
    );
  }

  const width = 420;
  const height = 200;
  const padLeft = 32;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 30;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxCount = Math.max(1, ...stats.map((s) => s.jobCount));
  const yTicks = Array.from(
    { length: Math.min(maxCount + 1, 5) },
    (_, idx) => Math.round((maxCount * idx) / Math.min(maxCount, 4)),
  );
  const uniqueYTicks = [...new Set(yTicks)];

  const points = stats.map((item, index) => {
    const x =
      padLeft +
      (stats.length === 1
        ? plotW / 2
        : (index / (stats.length - 1)) * plotW);
    const y = padTop + plotH - (item.jobCount / maxCount) * plotH;
    return { ...item, x, y };
  });

  const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = [
    `M ${points[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)}`,
    ...points.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`),
    `L ${points[points.length - 1].x.toFixed(1)} ${(padTop + plotH).toFixed(1)}`,
    "Z",
  ].join(" ");

  const activePoint = hoveredIdx !== null ? points[hoveredIdx] : null;

  return (
    <div className="relative rounded-2xl border border-neutral-500/60 bg-overlay/5 p-3">
      {activePoint && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-2 right-3 rounded-lg border border-primary-300/60 bg-surface px-2.5 py-1 text-xs font-medium text-neutral-50 shadow"
        >
          {activePoint.yearMonth}:{" "}
          <span className="font-bold text-primary-200">
            {activePoint.jobCount} {activePoint.jobCount === 1 ? "job" : "jobs"}
          </span>
        </div>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-48 w-full overflow-visible"
        role="img"
        aria-label={`Monthly hiring timeline for ${companyName}: ${totalOpenings} total openings over ${stats.length} months`}
      >
        {/* Horizontal Gridlines & Y-Axis Ticks */}
        {uniqueYTicks.map((tick) => {
          const y = padTop + plotH - (tick / maxCount) * plotH;
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                className="stroke-neutral-500/40"
                strokeDasharray="3 3"
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-neutral-200 text-[10px]"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {/* Subtle Area Fill */}
        <path d={areaPath} className="fill-primary-300/15" />

        {/* Line */}
        <polyline
          fill="none"
          points={polyline}
          className="stroke-primary-300"
          strokeWidth={2.25}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Points & X-Axis Labels */}
        {points.map((pt, idx) => {
          const showLabel = idx % 2 === 1 || idx === points.length - 1;
          const isHovered = hoveredIdx === idx;
          return (
            <g key={pt.yearMonth}>
              {showLabel && (
                <text
                  x={pt.x}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-neutral-200 text-[10px]"
                >
                  {formatMonthShort(pt.yearMonth)}
                </text>
              )}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 5.5 : 3.5}
                className="fill-primary-300 stroke-surface transition-all"
                strokeWidth={2}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <title>{`${pt.yearMonth}: ${pt.jobCount} opened position${pt.jobCount === 1 ? "" : "s"}`}</title>
              </circle>
            </g>
          );
        })}
      </svg>

      {/* Screen-reader accessible table alternative */}
      <table className="sr-only">
        <caption>Monthly opened positions for {companyName}</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Opened Positions</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((row) => (
            <tr key={row.yearMonth}>
              <td>{row.yearMonth}</td>
              <td>{row.jobCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
