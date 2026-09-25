import type * as Monaco from "monaco-editor";
import type { Diagnostic } from "./diagnostics";
import { BUILTIN_FUNCTIONS, CLAUSE_KEYWORDS, STATEMENT_KEYWORDS } from "./tokens";
import { renderDiagnostic, type Locale } from "../i18n/messages";

export const LANGUAGE_ID = "equatran";
export const LIGHT_THEME = "equatran-light";
export const DARK_THEME = "equatran-dark";

const KEYWORDS = [...STATEMENT_KEYWORDS, ...CLAUSE_KEYWORDS];

/** Registers the EQUATRAN language, its colouring and both themes. Safe to
 *  call more than once. */
export function registerEquatranLanguage(monaco: typeof Monaco): void {
  if (monaco.languages.getLanguages().some((l) => l.id === LANGUAGE_ID)) return;

  monaco.languages.register({ id: LANGUAGE_ID, extensions: [".eqs"] });

  monaco.languages.setLanguageConfiguration(LANGUAGE_ID, {
    comments: { lineComment: "//" },
    brackets: [
      ["(", ")"],
      ["[", "]"],
    ],
    autoClosingPairs: [
      { open: "(", close: ")" },
      { open: "[", close: "]" },
    ],
surroundingPairs: [
      { open: "(", close: ")" },
      { open: "[", close: "]" },
    ],
  });

  monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, {
    ignoreCase: true,
    keywords: KEYWORDS as unknown as string[],
    functions: Object.keys(BUILTIN_FUNCTIONS),
    tokenizer: {
      root: [
        [/\/\/.*$/, "comment"],
        // An equation label: a name at the start of a line followed by ':'.
        [/^[ \t]*[A-Za-z_]\w*(?=[ \t]*:)/, "type.identifier"],
        // A state variable, recognised by the prime that follows it.
        [/[A-Za-z_]\w*(?=')/, "variable.name"],
        [
          /[A-Za-z_]\w*/,
          {
            cases: {
              "@keywords": "keyword",
              "@functions": "predefined",
              "@default": "identifier",
            },
          },
        ],
        [/\d+\.?\d*(?:[eE][-+]?\d+)?/, "number"],
        [/\.\d+(?:[eE][-+]?\d+)?/, "number"],
        [/[#']/, "keyword.operator"],
        [/[=]/, "delimiter"],
        [/[+\-*/^]/, "operator"],
        [/[()[\]]/, "@brackets"],
        [/[,;:]/, "delimiter"],
        [/[ \t\r\n]+/, ""],
      ],
    },
  });

  monaco.editor.defineTheme(LIGHT_THEME, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6a8759", fontStyle: "italic" },
      { token: "keyword", foreground: "0b5cad", fontStyle: "bold" },
      { token: "predefined", foreground: "7a3e9d" },
      { token: "type.identifier", foreground: "b45309", fontStyle: "bold" },
      { token: "variable.name", foreground: "0f766e", fontStyle: "bold" },
      { token: "number", foreground: "1a7f37" },
      { token: "operator", foreground: "374151" },
    ],
    colors: {},
  });

  monaco.editor.defineTheme(DARK_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "7aa06a", fontStyle: "italic" },
      { token: "keyword", foreground: "6fb3ff", fontStyle: "bold" },
      { token: "predefined", foreground: "c792ea" },
      { token: "type.identifier", foreground: "f0ad4e", fontStyle: "bold" },
      { token: "variable.name", foreground: "4ec9b0", fontStyle: "bold" },
      { token: "number", foreground: "9cdcfe" },
      { token: "operator", foreground: "d4d4d4" },
    ],
    colors: {},
  });
}

/** Turns diagnostics into Monaco markers, which draw the squiggles and fill
 *  the editor's own hover cards. */
export function toMarkers(
  monaco: typeof Monaco,
  diagnostics: readonly Diagnostic[],
  locale: Locale,
): Monaco.editor.IMarkerData[] {
  return diagnostics.map((item) => {
    const rendered = renderDiagnostic(item, locale);
    return {
      severity:
        item.severity === "error"
          ? monaco.MarkerSeverity.Error
          : monaco.MarkerSeverity.Warning,
      code: item.code,
      message: rendered.fix
        ? `${rendered.message}\n→ ${rendered.fix}`
        : rendered.message,
      startLineNumber: item.span.start.line,
      startColumn: item.span.start.column,
      endLineNumber: item.span.end.line,
      // A zero-width span would draw nothing, so widen it by one character.
      endColumn:
        item.span.end.line === item.span.start.line &&
        item.span.end.column === item.span.start.column
          ? item.span.start.column + 1
          : item.span.end.column,
    };
  });
}
