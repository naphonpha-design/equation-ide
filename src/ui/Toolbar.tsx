import type { FileEncoding } from "../encoding/tis620";
import type { Locale } from "../i18n/messages";
import { UI } from "../i18n/ui";

interface ToolbarProps {
  fileName: string;
  encoding: FileEncoding;
  locale: Locale;
  theme: "light" | "dark";
  errorCount: number;
  warningCount: number;
  onEncodingChange: (encoding: FileEncoding) => void;
  onLocaleChange: (locale: Locale) => void;
  onThemeToggle: () => void;
  onSave: () => void;
  onRun: () => void;
}

export function Toolbar({
  fileName,
  encoding,
  locale,
  theme,
  errorCount,
  warningCount,
  onEncodingChange,
  onLocaleChange,
  onThemeToggle,
  onSave,
  onRun,
}: ToolbarProps) {
  const strings = UI[locale];

  return (
    <header className="toolbar">
      <div className="toolbar__identity">
        <span className="toolbar__logo">∑</span>
        <span className="toolbar__title">{strings.appName}</span>
        <span className="toolbar__tagline">{strings.tagline}</span>
      </div>

      <div className="toolbar__file">
        <span className="toolbar__filename">{fileName}</span>
        <span
          className={`toolbar__count toolbar__count--error${
            errorCount === 0 ? " is-quiet" : ""
          }`}
        >
          ● {strings.errors(errorCount)}
        </span>
        <span
          className={`toolbar__count toolbar__count--warning${
            warningCount === 0 ? " is-quiet" : ""
          }`}
        >
          ▲ {strings.warnings(warningCount)}
        </span>
      </div>

      <div className="toolbar__controls">
        <button type="button" className="button button--run" onClick={onRun}>
          ▶ {strings.run}
        </button>
        <button type="button" onClick={onSave}>
          {strings.saveFile}
        </button>
        <label className="field">
          <span className="field__label">{strings.encoding}</span>
          <select
            value={encoding}
            onChange={(event) =>
              onEncodingChange(event.target.value as FileEncoding)
            }
          >
            <option value="utf-8">UTF-8</option>
            <option value="tis-620">TIS-620</option>
          </select>
        </label>
        <div className="segmented" role="group" aria-label={strings.language}>
          <button
            type="button"
            className={locale === "th" ? "is-active" : ""}
            onClick={() => onLocaleChange("th")}
          >
            ไทย
          </button>
          <button
            type="button"
            className={locale === "en" ? "is-active" : ""}
            onClick={() => onLocaleChange("en")}
          >
            EN
          </button>
        </div>
        <button type="button" onClick={onThemeToggle} title={strings.theme}>
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </div>
    </header>
  );
}
