import type { Diagnostic } from "../lang";
import { renderDiagnostic, type Locale } from "../i18n/messages";
import { UI } from "../i18n/ui";

interface ProblemsPanelProps {
  diagnostics: readonly Diagnostic[];
  locale: Locale;
  onSelect: (line: number, column: number) => void;
}

export function ProblemsPanel({
  diagnostics,
  locale,
  onSelect,
}: ProblemsPanelProps) {
  const strings = UI[locale];

  if (diagnostics.length === 0) {
    return (
      <div className="problems problems--empty">
        <span className="problems__ok">✓</span> {strings.noProblems}
      </div>
    );
  }

  return (
    <ul className="problems">
      {diagnostics.map((item, index) => {
        const rendered = renderDiagnostic(item, locale);
        return (
          <li
            key={`${item.code}-${item.span.start.offset}-${index}`}
            className={`problem problem--${item.severity}`}
          >
            <button
              type="button"
              className="problem__button"
              onClick={() =>
                onSelect(item.span.start.line, item.span.start.column)
              }
            >
              <span className="problem__badge">
                {item.severity === "error" ? "●" : "▲"}
              </span>
              <span className="problem__location">
                {item.span.start.line}:{item.span.start.column}
              </span>
              <span className="problem__body">
                <span className="problem__message">{rendered.message}</span>
                {rendered.fix ? (
                  <span className="problem__fix">→ {rendered.fix}</span>
                ) : null}
              </span>
              <span className="problem__code">{item.code}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
