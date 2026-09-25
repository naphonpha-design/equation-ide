import { describe, expect, it } from "vitest";
import { parse } from "../src/lang/parser";
import type { BinaryExpression, EquationStatement } from "../src/lang/ast";

const statements = (source: string) => parse(source).program.statements;
const codes = (source: string) => parse(source).diagnostics.map((d) => d.code);

describe("parser", () => {
  it("parses a plain assignment", () => {
    const [statement] = statements("FA0=3");
    expect(statement).toMatchObject({
      kind: "equation",
      left: { kind: "variable", name: "FA0" },
      right: { kind: "number", value: 3 },
    });
  });

  it("parses several statements separated by semicolons", () => {
    expect(statements("FC0=0; FD0=0; FE0=0")).toHaveLength(3);
  });

  it("parses a labelled implicit equation", () => {
    const [statement] = statements("ebal: Q+W-r1*V=S*(T-TF)") as [EquationStatement];
    expect(statement.label?.name).toBe("ebal");
    expect(statement.left.kind).toBe("binary");
  });

  it("parses a derivative and its initial condition", () => {
    const parsed = statements("FA'=-rs1-2*rs2;    FA#FA0");
    expect(parsed[0]).toMatchObject({ kind: "derivative", target: { name: "FA" } });
    expect(parsed[1]).toMatchObject({ kind: "initial", target: { name: "FA" } });
  });

  it("parses RESET with bounds and a BY clause", () => {
    const [statement] = statements("RESET T # 150 [40,400] BY ebal");
    expect(statement).toMatchObject({
      kind: "reset",
      target: { name: "T" },
      by: { name: "ebal" },
    });
  });

  it("parses INTEGRAL with step and method", () => {
    const [statement] = statements("INTEGRAL W[0,50] step 0.1 by RKV");
    expect(statement).toMatchObject({
      kind: "integral",
      variable: { name: "W" },
      method: { name: "RKV" },
    });
  });

  it("parses trend with a trailing step", () => {
    const [statement] = statements("trend z,CA,CB step 1");
    expect(statement).toMatchObject({ kind: "trend" });
    expect((statement as { names: unknown[] }).names).toHaveLength(3);
  });

  it("parses OUTPUT lists", () => {
    const [statement] = statements("OUTPUT T,XA,SCA");
    expect((statement as { names: { name: string }[] }).names.map((n) => n.name))
      .toEqual(["T", "XA", "SCA"]);
  });

  it("matches keywords regardless of case", () => {
    expect(statements("output T")[0]!.kind).toBe("output");
    expect(statements("Integral W[0,1] STEP 0.1 BY RKV")[0]!.kind).toBe("integral");
  });

  it("gives ^ higher precedence than * and makes it right-associative", () => {
    const [statement] = statements("y=a*b^c^d") as [EquationStatement];
    const root = statement.right as BinaryExpression;
    expect(root.operator).toBe("*");
    const power = root.right as BinaryExpression;
    expect(power.operator).toBe("^");
    expect((power.right as BinaryExpression).operator).toBe("^");
  });

  it("applies unary minus outside a power", () => {
    const [statement] = statements("y=-2^2") as [EquationStatement];
    expect(statement.right).toMatchObject({
      kind: "unary",
      operand: { kind: "binary", operator: "^" },
    });
  });

  it("reports an unclosed parenthesis", () => {
    expect(codes("y=(a+b")).toContain("E103");
  });

  it("reports a missing operand", () => {
    expect(codes("y=a*")).toContain("E109");
  });

  it("reports a statement with no equals sign", () => {
    expect(codes("y+1")).toContain("E106");
  });

  it("reports a second equals sign", () => {
    expect(codes("a=1=2")).toContain("E105");
  });

  it("recovers and keeps parsing after a bad line", () => {
    const parsed = parse("a=(1\nb=2\nc=3");
    expect(parsed.program.statements).toHaveLength(2);
  });

  it("reports a malformed RESET", () => {
    expect(codes("RESET # 150 [40,400] BY ebal")).toContain("E110");
  });
});
