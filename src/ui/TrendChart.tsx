import { useMemo, useState } from "react";
import type { TrendTable } from "../solver/solve";
import type { Locale } from "../i18n/messages";
import { UI } from "../i18n/ui";

interface TrendChartProps {
  table: TrendTable;
  locale: Locale;
}

const PANEL_WIDTH = 260;
const PANEL_HEIGHT = 120;
const PADDING = { top: 10, right: 10, bottom: 20, left: 10 };

interface Series {
  name: string;
  points: { x: number; y: number }[];
  min: number;
  max: number;
}

/** Enough digits to tell two nearby readings apart, short enough to sit on a
 *  120px panel. */
function short(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1e5 || magnitude < 1e-3) return value.toExponential(2);
  return Number(value.toPrecision(5)).toString();
}

/**
 * The profile of every trended variable along the independent variable, as
 * one small panel each.
 *
 * Small multiples rather than one set of axes: a reactor profile mixes a
 * concentration of a few hundred, a conversion under one, and a pressure of
 * millions. Sharing a y-axis would flatten all but the largest, and a second
 * y-axis makes two unrelated scales look comparable. Each panel keeps its own
 * range, printed on it, and every panel shares the x-axis and the cursor.
 */
export function TrendChart({ table, locale }: TrendChartProps) {
  const strings = UI[locale];
  const [cursor, setCursor] = useState<number | undefined>();

  const series = useMemo<Series[]>(() => {
    return table.columns.slice(1).map((name, column) => {
      const points = table.rows.map((row) => ({
        x: row[0]!,
        y: row[column + 1]!,
      }));
      const finite = points.map((point) => point.y).filter(Number.isFinite);
      return {
        name,
        points,
        min: finite.length > 0 ? Math.min(...finite) : 0,
        max: finite.length > 0 ? Math.max(...finite) : 1,
      };
    });
  }, [table]);

  const xs = table.rows.map((row) => row[0]!);
  const xMin = xs[0] ?? 0;
  const xMax = xs[xs.length - 1] ?? 1;

  if (table.rows.length < 2) {
    return <div className="chart chart--empty">{strings.trendTooShort}</div>;
  }

  const nearest = (fraction: number): number => {
    const target = xMin + fraction * (xMax - xMin);
    let best = 0;
    for (let index = 1; index < xs.length; index += 1) {
      if (Math.abs(xs[index]! - target) < Math.abs(xs[best]! - target)) {
        best = index;
      }
    }
    return best;
  };

  return (
    <div className="chart">
      <div className="chart__axisNote">
        {strings.alongAxis(table.independent, short(xMin), short(xMax))}
      </div>
      <div className="chart__grid">
        {series.map((item) => {
          const span = item.max - item.min || Math.abs(item.max) || 1;
          const low = item.min - span * 0.08;
          const high = item.max + span * 0.08;
          const plotWidth = PANEL_WIDTH - PADDING.left - PADDING.right;
          const plotHeight = PANEL_HEIGHT - PADDING.top - PADDING.bottom;
          const toX = (x: number) =>
            PADDING.left +
            (xMax === xMin ? 0 : ((x - xMin) / (xMax - xMin)) * plotWidth);
          const toY = (y: number) =>
            PADDING.top +
            (high === low ? plotHeight / 2 : ((high - y) / (high - low)) * plotHeight);

          const path = item.points
            .filter((point) => Number.isFinite(point.y))
            .map(
              (point, index) =>
                `${index === 0 ? "M" : "L"}${toX(point.x).toFixed(2)},${toY(point.y).toFixed(2)}`,
            )
            .join(" ");

          const marked = cursor !== undefined ? item.points[cursor] : undefined;

          return (
            <figure className="chart__panel" key={item.name}>
              <figcaption className="chart__caption">
                <span className="chart__name">{item.name}</span>
                <span className="chart__reading">
                  {marked ? short(marked.y) : short(item.points.at(-1)!.y)}
                </span>
              </figcaption>
              <svg
                viewBox={`0 0 ${PANEL_WIDTH} ${PANEL_HEIGHT}`}
                className="chart__svg"
                role="img"
                aria-label={strings.profileOf(item.name, table.independent)}
                onMouseLeave={() => setCursor(undefined)}
                onMouseMove={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  const fraction =
                    (event.clientX - box.left) / Math.max(box.width, 1);
                  setCursor(nearest(Math.min(1, Math.max(0, fraction))));
                }}
              >
                <line
                  className="chart__baseline"
                  x1={PADDING.left}
                  x2={PANEL_WIDTH - PADDING.right}
                  y1={PANEL_HEIGHT - PADDING.bottom}
                  y2={PANEL_HEIGHT - PADDING.bottom}
                />
                <path className="chart__line" d={path} />
                {marked && Number.isFinite(marked.y) ? (
                  <g className="chart__cursor">
                    <line
                      x1={toX(marked.x)}
                      x2={toX(marked.x)}
                      y1={PADDING.top}
                      y2={PANEL_HEIGHT - PADDING.bottom}
                    />
                    <circle cx={toX(marked.x)} cy={toY(marked.y)} r={4} />
                  </g>
                ) : null}
                <text
                  className="chart__range"
                  x={PADDING.left}
                  y={PANEL_HEIGHT - 6}
                >
                  {short(item.min)}
                </text>
                <text
                  className="chart__range chart__range--end"
                  x={PANEL_WIDTH - PADDING.right}
                  y={PANEL_HEIGHT - 6}
                >
                  {short(item.max)}
                </text>
              </svg>
            </figure>
          );
        })}
      </div>
      <div className="chart__cursorNote">
        {cursor === undefined
          ? strings.hoverForValues
          : `${table.independent} = ${short(xs[cursor]!)}`}
      </div>
    </div>
  );
}
