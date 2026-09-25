import { describe, expect, it } from "vitest";
import { lex } from "../src/lang/lexer";

const kinds = (source: string) =>
  lex(source).tokens.map((token) => token.kind).filter((k) => k !== "eof");

describe("lexer", () => {
  it("reads scientific notation as one number", () => {
    const { tokens } = lex("dp=5.00E-3");
    expect(tokens.map((t) => t.text)).toEqual(["dp", "=", "5.00E-3", ""]);
  });

  it("reads a bare exponent as one number", () => {
    expect(lex("1E-12").tokens[0]!.text).toBe("1E-12");
  });

  it("flags an exponent with no digits", () => {
    const { diagnostics } = lex("x=1E");
    expect(diagnostics.map((d) => d.code)).toEqual(["E002"]);
  });

  it("drops comments but keeps their spans", () => {
    const { comments } = lex("FA0=3   //mol/s\nFB0=10");
    expect(comments).toHaveLength(1);
    expect(comments[0]!.start.line).toBe(1);
    expect(kinds("FA0=3 //mol/s\nFB0=10")).toEqual([
      "ident", "equals", "number", "newline", "ident", "equals", "number",
    ]);
  });

  it("treats newline and semicolon as separate tokens", () => {
    expect(kinds("a=1; b=2")).toContain("semicolon");
  });

  it("tracks line and column from one", () => {
    const { tokens } = lex("a=1\nbb=2");
    const bb = tokens.find((t) => t.text === "bb")!;
    expect(bb.span.start.line).toBe(2);
    expect(bb.span.start.column).toBe(1);
    expect(bb.span.end.column).toBe(3);
  });

  it("reports a character outside the language", () => {
    const { diagnostics } = lex("a = 1 @ 2");
    expect(diagnostics.map((d) => d.code)).toEqual(["E001"]);
    expect(diagnostics[0]!.span.start.column).toBe(7);
  });

  it("reads the prime that marks a derivative", () => {
    expect(kinds("FA'=1")).toEqual(["ident", "prime", "equals", "number"]);
  });
});
