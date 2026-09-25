import type {
  Expression,
  NameRef,
  Program,
  Statement,
} from "./ast";
import type { Diagnostic } from "./diagnostics";
import { diagnostic } from "./diagnostics";
import { lex } from "./lexer";
import type { Span, Token } from "./tokens";
import { isKeyword } from "./tokens";

export interface ParseResult {
  program: Program;
  diagnostics: Diagnostic[];
  comments: Span[];
}

const BINARY_PRECEDENCE: Readonly<Record<string, number>> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
};

/** Raised internally to unwind to the next statement boundary. */
class StatementError extends Error {}

export function parse(source: string): ParseResult {
  const { tokens, diagnostics, comments } = lex(source);
  const parser = new Parser(tokens, diagnostics);
  return { program: parser.parseProgram(), diagnostics, comments };
}

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly diagnostics: Diagnostic[],
  ) {}

  parseProgram(): Program {
    const statements: Statement[] = [];
    while (!this.atEnd()) {
      if (this.peek().kind === "newline" || this.peek().kind === "semicolon") {
        this.index += 1;
        continue;
      }
      const before = this.index;
      try {
        statements.push(this.parseStatement());
        this.expectStatementEnd();
      } catch (error) {
        if (!(error instanceof StatementError)) throw error;
        this.skipToStatementEnd();
      }
      // Defensive: never loop without consuming a token.
      if (this.index === before) this.index += 1;
    }
    return { statements };
  }

  // ---------------------------------------------------------------- statements

  private parseStatement(): Statement {
    const token = this.peek();

    if (token.kind === "ident") {
      if (isKeyword(token.text, "RESET")) return this.parseReset();
      if (isKeyword(token.text, "INTEGRAL")) return this.parseIntegral();
      if (isKeyword(token.text, "TREND")) return this.parseTrend();
      if (isKeyword(token.text, "OUTPUT") || isKeyword(token.text, "PRINT")) {
        return this.parseOutput();
      }

      const next = this.peekAt(1);
      if (next.kind === "colon") return this.parseEquation(this.takeLabel());
      if (next.kind === "prime") return this.parseDerivative();
      if (next.kind === "hash") return this.parseInitial();
    }

    return this.parseEquation();
  }

  private takeLabel(): NameRef {
    const name = this.advance();
    this.advance(); // ':'
    return { name: name.text, span: name.span };
  }

  private parseEquation(label?: NameRef): Statement {
    const start = this.peek().span.start;
    const left = this.parseExpression();
    const equals = this.peek();
    if (equals.kind !== "equals") {
      this.fail("E106", { start, end: this.previous().span.end }, {
        text: this.describe(equals),
      });
    }
    this.advance();
    const right = this.parseExpression();

    // A second '=' means the writer ran two equations together.
    if (this.peek().kind === "equals") {
      this.report("error", "E105", this.peek().span, {});
    }

    const statement: Statement = {
      kind: "equation",
      left,
      right,
      span: { start, end: this.previous().span.end },
    };
    return label ? { ...statement, label } : statement;
  }

  private parseDerivative(): Statement {
    const start = this.peek().span.start;
    const target = this.advance();
    this.advance(); // "'"
    this.expect("equals", "=");
    const expression = this.parseExpression();
    return {
      kind: "derivative",
      target: { name: target.text, span: target.span },
      expression,
      span: { start, end: this.previous().span.end },
    };
  }

  private parseInitial(): Statement {
    const start = this.peek().span.start;
    const target = this.advance();
    this.advance(); // '#'
    const expression = this.parseExpression();
    return {
      kind: "initial",
      target: { name: target.text, span: target.span },
      expression,
      span: { start, end: this.previous().span.end },
    };
  }

  private parseReset(): Statement {
    const start = this.advance().span.start; // RESET
    const target = this.expectIdentifier("E110");
    this.expect("hash", "#", "E110");
    const guess = this.parseExpression();
    this.expect("lbracket", "[", "E110");
    const lower = this.parseExpression();
    this.expect("comma", ",", "E110");
    const upper = this.parseExpression();
    this.expect("rbracket", "]", "E104");
    if (!isKeyword(this.peek().text, "BY")) {
      this.fail("E110", this.peek().span, { text: this.describe(this.peek()) });
    }
    this.advance(); // BY
    const by = this.expectIdentifier("E110");
    return {
      kind: "reset",
      target,
      guess,
      lower,
      upper,
      by,
      span: { start, end: this.previous().span.end },
    };
  }

  private parseIntegral(): Statement {
    const start = this.advance().span.start; // INTEGRAL
    const variable = this.expectIdentifier("E111");
    this.expect("lbracket", "[", "E111");
    const lower = this.parseExpression();
    this.expect("comma", ",", "E111");
    const upper = this.parseExpression();
    this.expect("rbracket", "]", "E104");

    let step: Expression | undefined;
    let method: NameRef | undefined;
    while (this.peek().kind === "ident") {
      const clause = this.peek();
      if (isKeyword(clause.text, "STEP")) {
        this.advance();
        step = this.parseExpression();
        continue;
      }
      if (isKeyword(clause.text, "BY")) {
        this.advance();
        method = this.expectIdentifier("E111");
        continue;
      }
      break;
    }

    const statement = {
      kind: "integral" as const,
      variable,
      lower,
      upper,
      span: { start, end: this.previous().span.end },
    };
    return { ...statement, ...(step ? { step } : {}), ...(method ? { method } : {}) };
  }

  private parseTrend(): Statement {
    const start = this.advance().span.start; // trend
    const names = this.parseNameList();
    let step: Expression | undefined;
    if (this.peek().kind === "ident" && isKeyword(this.peek().text, "STEP")) {
      this.advance();
      step = this.parseExpression();
    }
    const statement = {
      kind: "trend" as const,
      names,
      span: { start, end: this.previous().span.end },
    };
    return step ? { ...statement, step } : statement;
  }

  private parseOutput(): Statement {
    const start = this.advance().span.start; // OUTPUT
    const names = this.parseNameList();
    return {
      kind: "output",
      names,
      span: { start, end: this.previous().span.end },
    };
  }

  private parseNameList(): NameRef[] {
    const names: NameRef[] = [];
    for (;;) {
      const token = this.peek();
      if (token.kind !== "ident") {
        this.fail("E112", token.span, { text: this.describe(token) });
      }
      // `step` after a name list ends it rather than joining it.
      if (names.length > 0 && isKeyword(token.text, "STEP")) break;
      this.advance();
      names.push({ name: token.text, span: token.span });
      if (this.peek().kind === "comma") {
        this.advance();
        continue;
      }
      break;
    }
    return names;
  }

  // --------------------------------------------------------------- expressions

  private parseExpression(minimumPrecedence = 1): Expression {
    let left = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (token.kind !== "operator") break;
      const precedence = BINARY_PRECEDENCE[token.text];
      if (precedence === undefined || precedence < minimumPrecedence) break;
      this.advance();
      const right = this.parseExpression(precedence + 1);
      left = {
        kind: "binary",
        operator: token.text as "+" | "-" | "*" | "/",
        left,
        right,
        span: { start: left.span.start, end: right.span.end },
      };
    }
    return left;
  }

  /** Unary sign binds looser than `^`, so `-2^2` is `-(2^2)`. */
  private parseUnary(): Expression {
    const token = this.peek();
    if (token.kind === "operator" && (token.text === "-" || token.text === "+")) {
      this.advance();
      const operand = this.parseUnary();
      return {
        kind: "unary",
        operator: token.text,
        operand,
        span: { start: token.span.start, end: operand.span.end },
      };
    }
    return this.parsePower();
  }

  /** `^` is right-associative: `2^3^2` is `2^(3^2)`. */
  private parsePower(): Expression {
    const base = this.parsePrimary();
    const token = this.peek();
    if (token.kind === "operator" && (token.text === "^" || token.text === "**")) {
      this.advance();
      const exponent = this.parseUnary();
      return {
        kind: "binary",
        operator: "^",
        left: base,
        right: exponent,
        span: { start: base.span.start, end: exponent.span.end },
      };
    }
    return base;
  }

  private parsePrimary(): Expression {
    const token = this.peek();

    if (token.kind === "number") {
      this.advance();
      return { kind: "number", value: Number(token.text), span: token.span };
    }

    if (token.kind === "ident") {
      this.advance();
      if (this.peek().kind === "lparen") {
        const open = this.advance();
        const args: Expression[] = [];
        if (this.peek().kind !== "rparen") {
          for (;;) {
            args.push(this.parseExpression());
            if (this.peek().kind !== "comma") break;
            this.advance();
          }
        }
        if (this.peek().kind !== "rparen") {
          this.fail("E103", open.span, {});
        }
        const close = this.advance();
        return {
          kind: "call",
          callee: { name: token.text, span: token.span },
          args,
          span: { start: token.span.start, end: close.span.end },
        };
      }
      return { kind: "variable", name: token.text, span: token.span };
    }

    if (token.kind === "lparen") {
      const open = this.advance();
      const inner = this.parseExpression();
      if (this.peek().kind !== "rparen") {
        this.fail("E103", open.span, {});
      }
      this.advance();
      return inner;
    }

    if (token.kind === "operator") {
      // An operator with nothing to its right, such as a trailing `*`.
      this.fail("E109", token.span, { text: token.text });
    }

    // The statement ran out before the expression was complete. Point at the
    // operator that is left hanging rather than at the invisible line end.
    const previous = this.previous();
    if (
      (token.kind === "eof" ||
        token.kind === "newline" ||
        token.kind === "semicolon") &&
      previous.kind === "operator"
    ) {
      this.fail("E109", previous.span, { text: previous.text });
    }

    this.fail("E100", token.span, { text: this.describe(token) });
  }

  // -------------------------------------------------------------------- tokens

  private peek(): Token {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1]!;
  }

  private peekAt(lookahead: number): Token {
    return (
      this.tokens[this.index + lookahead] ?? this.tokens[this.tokens.length - 1]!
    );
  }

  private previous(): Token {
    return this.tokens[Math.max(0, this.index - 1)]!;
  }

  private advance(): Token {
    const token = this.peek();
    if (token.kind !== "eof") this.index += 1;
    return token;
  }

  private atEnd(): boolean {
    return this.peek().kind === "eof";
  }

  private expect(
    kind: Token["kind"],
    text: string,
    code: "E101" | "E104" | "E110" | "E111" = "E101",
  ): Token {
    if (this.peek().kind !== kind) {
      this.fail(code, this.peek().span, {
        expected: text,
        text: this.describe(this.peek()),
      });
    }
    return this.advance();
  }

  private expectIdentifier(code: "E107" | "E110" | "E111" = "E107"): NameRef {
    const token = this.peek();
    if (token.kind !== "ident") {
      this.fail(code, token.span, { text: this.describe(token) });
    }
    this.advance();
    return { name: token.text, span: token.span };
  }

  private expectStatementEnd(): void {
    const token = this.peek();
    if (
      token.kind === "newline" ||
      token.kind === "semicolon" ||
      token.kind === "eof"
    ) {
      return;
    }
    if (token.kind === "rparen" || token.kind === "rbracket") {
      this.report("error", "E113", token.span, { text: token.text });
    } else {
      this.report("error", "E100", token.span, { text: this.describe(token) });
    }
    this.skipToStatementEnd();
  }

  private skipToStatementEnd(): void {
    while (!this.atEnd()) {
      const kind = this.peek().kind;
      if (kind === "newline" || kind === "semicolon") return;
      this.index += 1;
    }
  }

  /** Token text for messages. Positions with no text of their own get a
   *  marker the message renderer translates. */
  private describe(token: Token): string {
    switch (token.kind) {
      case "eof":
        return "<eof>";
      case "newline":
        return "<eol>";
      default:
        return token.text;
    }
  }

  private report(
    severity: "error" | "warning",
    code: Parameters<typeof diagnostic>[1],
    span: Span,
    args: Record<string, string | number>,
  ): void {
    this.diagnostics.push(diagnostic(severity, code, span, args));
  }

  private fail(
    code: Parameters<typeof diagnostic>[1],
    span: Span,
    args: Record<string, string | number>,
  ): never {
    this.report("error", code, span, args);
    throw new StatementError();
  }
}
