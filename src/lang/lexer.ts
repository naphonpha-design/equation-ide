import type { Position, Span, Token, TokenKind } from "./tokens";
import type { Diagnostic } from "./diagnostics";
import { diagnostic } from "./diagnostics";

const SINGLE_CHAR_TOKENS: Readonly<Record<string, TokenKind>> = {
  "(": "lparen",
  ")": "rparen",
  "[": "lbracket",
  "]": "rbracket",
  ",": "comma",
  ";": "semicolon",
  ":": "colon",
  "'": "prime",
  "#": "hash",
  "=": "equals",
};

const OPERATOR_CHARS = new Set(["+", "-", "*", "/", "^"]);

export interface LexResult {
  tokens: Token[];
  diagnostics: Diagnostic[];
  /** Spans of every comment, for syntax highlighting and unit hints. */
  comments: Span[];
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isIdentStart(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}

function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}

/**
 * Turns EQUATRAN source into a token stream.
 *
 * Newlines are significant: they terminate statements, as does `;`. Comments
 * run from `//` to the end of the line and are collected separately rather
 * than emitted as tokens.
 */
export function lex(source: string): LexResult {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  const comments: Span[] = [];

  let offset = 0;
  let line = 1;
  let column = 1;

  const here = (): Position => ({ offset, line, column });

  const advance = (count = 1): void => {
    for (let i = 0; i < count; i += 1) {
      if (source[offset] === "\n") {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
      offset += 1;
    }
  };

  const push = (kind: TokenKind, start: Position): void => {
    tokens.push({
      kind,
      text: source.slice(start.offset, offset),
      span: { start, end: here() },
    });
  };

  while (offset < source.length) {
    const ch = source[offset]!;

    // Line comment.
    if (ch === "/" && source[offset + 1] === "/") {
      const start = here();
      while (offset < source.length && source[offset] !== "\n") advance();
      comments.push({ start, end: here() });
      continue;
    }

    if (ch === "\n") {
      const start = here();
      advance();
      push("newline", start);
      continue;
    }

    // Any other whitespace, including carriage returns and tabs.
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\f" || ch === "\v") {
      advance();
      continue;
    }

    if (isDigit(ch) || (ch === "." && isDigit(source[offset + 1] ?? ""))) {
      const start = here();
      while (isDigit(source[offset] ?? "")) advance();
      if (source[offset] === ".") {
        advance();
        while (isDigit(source[offset] ?? "")) advance();
      }
      const exponent = source[offset];
      if (exponent === "e" || exponent === "E") {
        const mantissaEnd = here();
        advance();
        if (source[offset] === "+" || source[offset] === "-") advance();
        if (!isDigit(source[offset] ?? "")) {
          // `1E` or `1E+` with no digits after it. Emit the mantissa as the
          // number so the parser can carry on, and flag the dangling exponent.
          tokens.push({
            kind: "number",
            text: source.slice(start.offset, mantissaEnd.offset),
            span: { start, end: mantissaEnd },
          });
          diagnostics.push(
            diagnostic("error", "E002", { start: mantissaEnd, end: here() }, {
              text: source.slice(mantissaEnd.offset, offset),
            }),
          );
          continue;
        }
        while (isDigit(source[offset] ?? "")) advance();
      }
      push("number", start);
      continue;
    }

    if (isIdentStart(ch)) {
      const start = here();
      while (isIdentPart(source[offset] ?? "")) advance();
      push("ident", start);
      continue;
    }

    if (OPERATOR_CHARS.has(ch)) {
      const start = here();
      advance();
      // `**` is accepted as a synonym for `^`, which some models use.
      if (ch === "*" && source[offset] === "*") advance();
      push("operator", start);
      continue;
    }

    const single = SINGLE_CHAR_TOKENS[ch];
    if (single !== undefined) {
      const start = here();
      advance();
      push(single, start);
      continue;
    }

    // Anything else is not part of the language.
    const start = here();
    advance();
    const span: Span = { start, end: here() };
    diagnostics.push(diagnostic("error", "E001", span, { text: ch }));
  }

  tokens.push({ kind: "eof", text: "", span: { start: here(), end: here() } });
  return { tokens, diagnostics, comments };
}
