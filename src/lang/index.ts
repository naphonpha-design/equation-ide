import type { Program } from "./ast";
import { analyze, type ModelSymbols } from "./analyze";
import type { Diagnostic } from "./diagnostics";
import { bySourceOrder } from "./diagnostics";
import { parse } from "./parser";
import { analyzeStructure, type ModelStructure } from "./structure";
import type { Span } from "./tokens";

export interface ValidationResult {
  program: Program;
  symbols: ModelSymbols;
  /** Present once the model parses and its names all resolve. */
  structure?: ModelStructure;
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
  if (hasSyntaxError) {
    const diagnostics = [...parseDiagnostics].sort(bySourceOrder);
    return { program, symbols, diagnostics, comments };
  }

  // Structural checks only mean something once every name resolves; before
  // that they would blame the model for a typo already reported above.
  const hasSemanticError = semanticDiagnostics.some((d) => d.severity === "error");
  const diagnostics = [...parseDiagnostics, ...semanticDiagnostics];
  let structure: ModelStructure | undefined;
  if (!hasSemanticError) {
    const structural = analyzeStructure(program, symbols);
    structure = structural.structure;
    diagnostics.push(...structural.diagnostics);
  }
  diagnostics.sort(bySourceOrder);
  return {
    program,
    symbols,
    ...(structure ? { structure } : {}),
    diagnostics,
    comments,
  };
}

export type { ModelSymbols, VariableInfo, VariableRole } from "./analyze";
export type { Diagnostic, DiagnosticCode, Severity } from "./diagnostics";
export type { ModelStructure, EquationSlot } from "./structure";
export * from "./ast";
export { parse } from "./parser";
export { lex } from "./lexer";
