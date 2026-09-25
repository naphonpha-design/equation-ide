import { useState } from "react";
import type { SolveResult } from "../solver/solve";
import type { Locale } from "../i18n/messages";
import { UI } from "../i18n/ui";
import { TrendChart } from "./TrendChart";

interface ResultsPanelProps {
  result: SolveResult | undefined;
  locale: Locale;
}

/** Enough digits to show that two nearly equal results differ, without
 *  pretending to a precision the solver does not have. */
function format(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1e6 || magnitude < 1e-4) return value.toExponential(6);
  return Number(value.toPrecision(10)).toString();
}

export function ResultsPanel({ result, locale }: ResultsPanelProps) {
  const strings = UI[locale];
  const [view, setView] = useState<
    "table" | "trend" | "chart" | "console"
  >("table");

  if (!result) {
    return <div className="results results--empty">{strings.notRunYet}</div>;
  }

  if (result.failure) {
    return (
      <div className="results">
        <div className="results__failure">
          <strong>{strings.solveFailedTitle}</strong>
          <span>{strings.solveFailure(result.failure)}</span>
        </div>
        {result.log.length > 0 ? (
          <pre className="results__console">{result.log.join("\n")}</pre>
        ) : null}
      </div>
    );
  }

  const iterated = result.blocks.filter((block) => !block.direct);
  const trend = result.trend;

  const downloadCsv = (): void => {
    if (!trend) return;
    const lines = [
      trend.columns.join(","),
      ...trend.rows.map((row) => row.map((value) => String(value)).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "trend.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="results">
      <div className="results__summary">
        <span className="chip chip--ok">{strings.solved}</span>
        <span className="chip" title={strings.residualHint}>
          {strings.residual(result.maxResidual)}
        </span>
        <span className="chip">
          {strings.blocksSolved(result.blocks.length, iterated.length)}
        </span>
        {result.integration ? (
          <span className="chip">
            {strings.integrationSummary(
              result.integration.steps,
              result.integration.method,
            )}
          </span>
        ) : null}
        {trend ? (
          <button type="button" onClick={downloadCsv}>
            {strings.exportCsv}
          </button>
        ) : null}
        <div className="segmented results__views">
          <button
            type="button"
            className={view === "table" ? "is-active" : ""}
            onClick={() => setView("table")}
          >
            {strings.outputTable}
          </button>
          {trend ? (
            <>
              <button
                type="button"
                className={view === "trend" ? "is-active" : ""}
                onClick={() => setView("trend")}
              >
                {strings.trendTable}
              </button>
              <button
                type="button"
                className={view === "chart" ? "is-active" : ""}
                onClick={() => setView("chart")}
              >
                {strings.trendChart}
              </button>
            </>
          ) : null}
          <button
            type="button"
            className={view === "console" ? "is-active" : ""}
            onClick={() => setView("console")}
          >
            {strings.rawConsole}
          </button>
        </div>
      </div>

      {view === "chart" && trend ? (
        <TrendChart table={trend} locale={locale} />
      ) : view === "trend" && trend ? (
        <div className="results__scroller">
          <table className="results__table results__table--wide">
            <thead>
              <tr>
                {trend.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trend.rows.map((row, index) => (
                <tr key={index}>
                  {row.map((value, column) => (
                    <td key={column} className="results__value">
                      {format(value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : view === "table" ? (
        <table className="results__table">
          <thead>
            <tr>
              <th>{strings.columnName}</th>
              <th>{strings.columnValue}</th>
            </tr>
          </thead>
          <tbody>
            {result.outputs.map((output) => (
              <tr key={output.name}>
                <td className="results__name">{output.name}</td>
                <td className="results__value">{format(output.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <pre className="results__console">
          {[
            ...result.log,
            "",
            ...result.outputs.map(
              (output) => `${output.name.padEnd(10)}${format(output.value)}`,
            ),
            "",
            strings.residual(result.maxResidual),
          ].join("\n")}
        </pre>
      )}
    </div>
  );
}
