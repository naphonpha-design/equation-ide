import { useMemo, useState } from "react";
import type { ModelStructure, ModelSymbols, VariableRole } from "../lang";
import type { Locale } from "../i18n/messages";
import { UI } from "../i18n/ui";

interface VariablesPanelProps {
  symbols: ModelSymbols;
  structure: ModelStructure | undefined;
  locale: Locale;
  onSelect: (line: number, column: number) => void;
}

const ROLE_ORDER: VariableRole[] = [
  "independent",
  "state",
  "algebraic",
  "unknown",
];

export function VariablesPanel({
  symbols,
  structure,
  locale,
  onSelect,
}: VariablesPanelProps) {
  const strings = UI[locale];
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return [...symbols.variables.values()]
      .filter((info) => info.name.toLowerCase().includes(needle))
      .sort((a, b) => {
        const byRole =
          ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
        return byRole !== 0 ? byRole : a.name.localeCompare(b.name);
      });
  }, [symbols, filter]);

  if (!structure) {
    return (
      <div className="varmap varmap--empty">{strings.variablesUnavailable}</div>
    );
  }

  const balanced = structure.degreesOfFreedom === 0;

  return (
    <div className="varmap">
      <div className="varmap__summary">
        <span
          className={`chip ${balanced ? "chip--ok" : "chip--error"}`}
          title={strings.balanceHint}
        >
          {strings.balance(
            structure.unknowns.length,
            structure.equations.length,
          )}
        </span>
        {structure.independent ? (
          <span className="chip">
            {strings.roleIndependent}: <code>{structure.independent}</code>
          </span>
        ) : null}
        {structure.states.length > 0 ? (
          <span className="chip">
            {strings.roleState}: {structure.states.length}
          </span>
        ) : null}
        {structure.loops.length > 0 ? (
          <span className="chip chip--loop">
            {strings.loops(structure.loops.length)}
          </span>
        ) : null}
        <input
          className="varmap__filter"
          type="search"
          value={filter}
          placeholder={strings.filterVariables}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>

      {structure.loops.map((loop, index) => (
        <div className="varmap__loop" key={index}>
          <span className="varmap__loopLabel">{strings.loopLabel}</span>
          <code>{loop.join(" → ")}</code>
        </div>
      ))}

      <table className="varmap__table">
        <thead>
          <tr>
            <th>{strings.columnName}</th>
            <th>{strings.columnRole}</th>
            <th>{strings.columnDefined}</th>
            <th>{strings.columnGuess}</th>
            <th>{strings.columnUses}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((info) => {
            const anchor =
              info.definitions[0] ??
              info.implicitEquations[0] ??
              info.references[0];
            return (
              <tr key={info.name}>
                <td>
                  <button
                    type="button"
                    className="varmap__name"
                    disabled={!anchor}
                    onClick={() =>
                      anchor && onSelect(anchor.start.line, anchor.start.column)
                    }
                  >
                    {info.name}
                  </button>
                </td>
                <td>
                  <span className={`role role--${info.role}`}>
                    {strings.role(info.role)}
                  </span>
                </td>
                <td className="varmap__numeric">
                  {anchor ? anchor.start.line : "—"}
                </td>
                <td className="varmap__numeric">
                  {info.hasReset
                    ? "RESET"
                    : info.initials.length > 0
                      ? "#"
                      : "—"}
                </td>
                <td className="varmap__numeric">{info.references.length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
