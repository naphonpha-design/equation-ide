import { useState } from "react";
import type { SolveResult } from "../solver/solve";
import type { Locale } from "../i18n/messages";
import { UI } from "../i18n/ui";

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
  const [view, setView] = useState<"table" | "console">("table");

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
        <div className="segmented results__views">
          <button
            type="button"
            className={view === "table" ? "is-active" : ""}
            onClick={() => setView("table")}
          >
            {strings.outputTable}
          </button>
          <button
            type="button"
            className={view === "console" ? "is-active" : ""}
            onClick={() => setView("console")}
          >
            {strings.rawConsole}
          </button>
        </div>
      </div>

      {view === "table" ? (
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
