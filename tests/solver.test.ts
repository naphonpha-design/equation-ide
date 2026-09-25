import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validate } from "../src/lang";
import { solveModel, type SolveResult } from "../src/solver/solve";
import { solveLinearSystem } from "../src/solver/newton";
import { evaluate } from "../src/solver/evaluate";
import { parse } from "../src/lang/parser";
import type { EquationStatement } from "../src/lang/ast";

function run(source: string): SolveResult {
  const { program, symbols, structure } = validate(source);
  if (!structure) throw new Error("model did not validate");
  return solveModel(program, symbols, structure);
}

const value = (result: SolveResult, name: string): number =>
  result.values.get(name)!;

const expression = (source: string) =>
  (parse(`y=${source}`).program.statements[0] as EquationStatement).right;

describe("expression evaluation", () => {
  const env = new Map([["a", 3], ["b", 4]]);

  it("follows operator precedence", () => {
    expect(evaluate(expression("2+3*4"), env)).toBe(14);
    expect(evaluate(expression("(2+3)*4"), env)).toBe(20);
  });

  it("treats ^ as right-associative and tighter than unary minus", () => {
    expect(evaluate(expression("2^3^2"), env)).toBe(512);
    expect(evaluate(expression("-2^2"), env)).toBe(-4);
  });

  it("evaluates builtin functions in any case", () => {
    expect(evaluate(expression("sqrt(a^2+b^2)"), env)).toBe(5);
    expect(evaluate(expression("MAX(a,b)"), env)).toBe(4);
    expect(evaluate(expression("Exp(0)"), env)).toBe(1);
  });
});

describe("linear algebra", () => {
  it("solves a well-posed system", () => {
    const x = solveLinearSystem([[2, 1], [1, 3]], [5, 10])!;
    expect(x[0]).toBeCloseTo(1, 12);
    expect(x[1]).toBeCloseTo(3, 12);
  });

  it("reports a singular matrix rather than returning nonsense", () => {
    expect(solveLinearSystem([[1, 2], [2, 4]], [3, 6])).toBeUndefined();
  });
});

describe("solving models", () => {
  it("evaluates a chain of plain assignments without iterating", () => {
    const result = run("a=2\nb=a*3\nc=b+1\nOUTPUT c");
    expect(result.converged).toBe(true);
    expect(value(result, "c")).toBe(7);
    expect(result.blocks.every((block) => block.direct)).toBe(true);
  });

  it("solves an implicit equation", () => {
    const result = run("PF=200\nFT0=16\nR=8.314\nPF*v0=FT0*R\nOUTPUT v0");
    expect(value(result, "v0")).toBeCloseTo((16 * 8.314) / 200, 10);
  });

  it("solves a nonlinear equation within its RESET bounds", () => {
    const source = [
      "c=2",
      "sq: x*x=c",
      "RESET x # 1 [0,5] BY sq",
      "OUTPUT x",
    ].join("\n");
    const result = run(source);
    expect(result.converged).toBe(true);
    expect(value(result, "x")).toBeCloseTo(Math.SQRT2, 9);
  });

  it("tears a circular group at the variable carrying the guess", () => {
    const source = "k=2\nx=k/(1+y)\ny=x*3\nx#0.5\nOUTPUT x,y";
    const result = run(source);
    expect(result.converged).toBe(true);
    // x(1+3x) = 2  =>  3x^2 + x - 2 = 0  =>  x = 2/3
    expect(value(result, "x")).toBeCloseTo(2 / 3, 9);
    expect(value(result, "y")).toBeCloseTo(2, 9);
    const loop = result.blocks.find((block) => !block.direct)!;
    expect(loop.variables.sort()).toEqual(["x", "y"]);
  });

  it("refuses a model with derivatives, which M4 will handle", () => {
    const source = [
      "FA'=-FA",
      "FA#1",
      "INTEGRAL W[0,1] step 0.1 by RKV",
      "OUTPUT FA",
    ].join("\n");
    expect(run(source).failure).toEqual({ kind: "unsupported-ode" });
  });

  it("reports the variables it could not solve rather than silently failing", () => {
    // No real root: x^2 = -1.
    const source = "c=-1\nsq: x*x=c\nRESET x # 1 [-5,5] BY sq\nOUTPUT x";
    const result = run(source);
    expect(result.converged).toBe(false);
    expect(result.failure).toMatchObject({ kind: "block-failed" });
  });
});

describe("the CSTR reference model", () => {
  const source = readFileSync(
    new URL("../samples/lec6-cstr.eqs", import.meta.url),
    "utf8",
  );
  const result = run(source);

  it("converges", () => {
    expect(result.failure).toBeUndefined();
    expect(result.converged).toBe(true);
  });

  it("satisfies every equation it was given", () => {
    expect(result.maxResidual).toBeLessThan(1e-8);
  });

  it("solves the temperature inside the bounds the model set", () => {
    const temperature = value(result, "T");
    expect(temperature).toBeGreaterThan(40);
    expect(temperature).toBeLessThan(400);
  });

  it("closes the mole balance on every species", () => {
    const v = (name: string) => value(result, name);
    const V = v("V");
    expect(v("FA")).toBeCloseTo(3 + (-v("r1") - 2 * v("r2")) * V, 9);
    expect(v("FB")).toBeCloseTo(10 - 2 * v("r1") * V, 9);
    expect(v("FD")).toBeCloseTo(3 * v("r1") * V, 9);
    expect(v("FE")).toBeCloseTo(v("r2") * V, 9);
  });

  it("reports conversion consistent with the flows it solved", () => {
    expect(value(result, "XA")).toBeCloseTo((3 - value(result, "FA")) / 3, 12);
  });

  it("produces a value for every name in OUTPUT", () => {
    expect(result.outputs).toHaveLength(14);
    for (const output of result.outputs) {
      expect(Number.isFinite(output.value)).toBe(true);
    }
  });
});
