/** A position inside a source file. Lines and columns are 1-based. */
export interface Position {
  offset: number;
  line: number;
  column: number;
}

/** A half-open source range, `start` inclusive and `end` exclusive. */
export interface Span {
  start: Position;
  end: Position;
}

export type TokenKind =
  | "number"
  | "ident"
  | "operator"
  | "lparen"
  | "rparen"
  | "lbracket"
  | "rbracket"
  | "comma"
  | "semicolon"
  | "colon"
  | "prime"
  | "hash"
  | "equals"
  | "newline"
  | "eof";

export interface Token {
  kind: TokenKind;
  /** Source text of the token, verbatim. */
  text: string;
  span: Span;
}

export const UNARY_OPERATORS = ["+", "-"] as const;
export const BINARY_OPERATORS = ["+", "-", "*", "/", "^"] as const;

export type BinaryOperator = (typeof BINARY_OPERATORS)[number];
export type UnaryOperator = (typeof UNARY_OPERATORS)[number];

/** Builtin functions, with the argument count each one accepts. */
export const BUILTIN_FUNCTIONS: Readonly<Record<string, number>> = {
  EXP: 1,
  LN: 1,
  LOG: 1,
  LOG10: 1,
  SQRT: 1,
  ABS: 1,
  SIN: 1,
  COS: 1,
  TAN: 1,
  ASIN: 1,
  ACOS: 1,
  ATAN: 1,
  SINH: 1,
  COSH: 1,
  TANH: 1,
  INT: 1,
  SIGN: 1,
  MAX: 2,
  MIN: 2,
  MOD: 2,
  ATAN2: 2,
};

/** Statement keywords. Matched case-insensitively, and never reserved: a model
 *  may still use `step` or `by` as an ordinary variable name inside an
 *  expression, which real EQUATRAN models occasionally do. */
export const STATEMENT_KEYWORDS = [
  "RESET",
  "INTEGRAL",
  "TREND",
  "OUTPUT",
  "PRINT",
] as const;

export const CLAUSE_KEYWORDS = ["STEP", "BY"] as const;

export function isKeyword(text: string, keyword: string): boolean {
  return text.toUpperCase() === keyword;
}
