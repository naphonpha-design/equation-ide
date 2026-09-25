import type { Program } from "./ast";
import { analyze, type ModelSymbols } from "./analyze";
import type { Diagnostic } from "./diagnostics";
import { bySourceOrder } from "./diagnostics";
import { parse } from "./parser";
import type { Span } from "./tokens";

export interface ValidationResult {
  program: Program;
  symbols: ModelSymbols;
  diagnostics: Diagnostic[];
  comments: Span[];
}

/** Parses and checks an EQUATRAN model, returning every diagnostic in
 *  source order. */
export function validate(source: string): ValidationResult {
  const { program, diagnostics: parseDiagnostics, comments } = parse(source);
  const { symbols, diagnostics: semanticDiagnostics } = analyze(program);
  // A file that does not parse produces unreliable semantics, so suppress the
  // semantic layer until the syntax is clean.
  const hasSyntaxError = parseDiagnostics.some((d) => d.severity === "error");
  const diagnostics = hasSyntaxError
    ? [...parseDiagnostics]
    : [...parseDiagnostics, ...semanticDiagnostics];
  diagnostics.sort(bySourceOrder);
  return { program, symbols, diagnostics, comments };
}

export type { ModelSymbols, VariableInfo, VariableRole } from "./analyze";
export type { Diagnostic, DiagnosticCode, Severity } from "./diagnostics";
export * from "./ast";
export { parse } from "./parser";
export { lex } from "./lexer";
