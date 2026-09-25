import type { Span } from "./tokens";

export type Severity = "error" | "warning" | "info";

/**
 * Diagnostic identifiers.
 *
 * `E0xx` lexical (L1), `E1xx` syntax (L2), `E2xx` semantic (L3),
 * `E3xx` structural (L4).
 */
export type DiagnosticCode =
  // L1 — lexical
  | "E001" // character that is not part of the language
  | "E002" // scientific notation with no exponent digits
  // L2 — syntax
  | "E100" // token that cannot appear here
  | "E101" // a specific token was required
  | "E103" // '(' never closed
  | "E104" // '[' never closed
  | "E105" // more than one '=' in an equation
  | "E106" // statement shape not recognised
  | "E107" // identifier required
  | "E108" // number required
  | "E109" // operator with a missing operand
  | "E110" // RESET clause malformed
  | "E111" // INTEGRAL clause malformed
  | "E112" // variable list malformed
  | "E113" // stray ')' or ']'
  // L3 — semantic
  | "E200" // variable used but never defined
  | "E201" // unknown function
  | "E202" // function called with the wrong number of arguments
  | "E203" // BY refers to a label that does not exist
  | "E204" // two statements share a label
  | "E205" // variable defined more than once
  | "E206" // variable defined but never used
  | "E207" // OUTPUT or trend names a variable that does not exist
  | "E208" // derivative used with no INTEGRAL statement
  | "E209" // more than one INTEGRAL statement
  | "E210" // '#' given for a variable nothing else mentions
  | "E211" // self-referential definition, e.g. `x = x + 1`
  | "E212"; // division by a quantity that is known to be zero

export interface Diagnostic {
  severity: Severity;
  code: DiagnosticCode;
  span: Span;
  /** Values interpolated into the rendered message. */
  args: Readonly<Record<string, string | number>>;
}

export function diagnostic(
  severity: Severity,
  code: DiagnosticCode,
  span: Span,
  args: Record<string, string | number> = {},
): Diagnostic {
  return { severity, code, span, args };
}

/** Orders diagnostics the way a reader scans a file: top to bottom, left to right. */
export function bySourceOrder(a: Diagnostic, b: Diagnostic): number {
  if (a.span.start.line !== b.span.start.line) {
    return a.span.start.line - b.span.start.line;
  }
  return a.span.start.column - b.span.start.column;
}

/**
 * Finds the closest name in `candidates` to `name`, for "did you mean" hints.
 * Returns undefined when nothing is close enough to be worth suggesting.
 */
export function suggestName(
  name: string,
  candidates: Iterable<string>,
): string | undefined {
  const limit = name.length <= 4 ? 1 : 2;
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (candidate === name) continue;
    const distance = editDistance(
      name.toLowerCase(),
      candidate.toLowerCase(),
      limit,
    );
    if (distance <= limit && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** Levenshtein distance, abandoned early once it exceeds `limit`. */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + cost,
      );
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length]!;
}
