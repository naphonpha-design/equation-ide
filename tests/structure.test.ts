import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validate } from "../src/lang";
import type { Diagnostic } from "../src/lang";

const check = (source: string): Diagnostic[] => validate(source).diagnostics;
const errors = (source: string) =>
  check(source).filter((d) => d.severity === "error");
const read = (name: string) =>
  readFileSync(new URL(`../samples/${name}`, import.meta.url), "utf8");

describe("structural analysis", () => {
  it("balances the CSTR model exactly", () => {
    const { structure } = validate(read("lec6-cstr.eqs"));
    expect(structure?.degreesOfFreedom).toBe(0);
    expect(structure?.unmatchedUnknowns).toEqual([]);
    expect(structure?.unmatchedEquations).toEqual([]);
  });

  it("balances the packed-bed model and finds its states", () => {
    const { structure } = validate(read("fixed-bed-isothermal.eqs"));
    expect(structure?.degreesOfFreedom).toBe(0);
    expect(structure?.independent).toBe("W");
    expect(structure?.states).toEqual([
      "FA", "FB", "FC", "FD", "FE", "FF", "P",
    ]);
  });

  it("recognises the torn circular group in the CSTR model", () => {
    const { structure, diagnostics } = validate(read("lec6-cstr.eqs"));
    expect(structure?.loops).toHaveLength(1);
    expect(structure?.loops[0]).toContain("r1");
    // It has guesses on r1, r2 and T, so it must not be reported.
    expect(diagnostics.map((d) => d.code)).not.toContain("E302");
  });

  it("names the variable left without an equation", () => {
    // Both names take part in the one equation, so neither is undefined —
    // there is simply one equation too few to pin them both down.
    const source = "x+y=1\nOUTPUT x,y";
    const [issue] = errors(source).filter((d) => d.code === "E300");
    expect(issue!.args.count).toBe(1);
    expect(["x", "y"]).toContain(issue!.args.names);
  });

  it("leaves a name nothing mentions to the semantic layer", () => {
    // `c` is reported as undefined, which says more than a count would.
    const codes = check("a=1\nb=a+c\nOUTPUT b").map((d) => d.code);
    expect(codes).toContain("E200");
    expect(codes).not.toContain("E300");
  });

  it("reports a surplus equation", () => {
    const source = "a=1\na+0=1\nb=a\nOUTPUT b";
    expect(errors(source).map((d) => d.code)).toContain("E301");
  });

  it("accepts an implicit equation that determines one unknown", () => {
    expect(errors("PF=20\nR=8.314\nPF*v0=R\nOUTPUT v0")).toEqual([]);
  });

  it("reports a state with no initial value", () => {
    const source = [
      "FA'=-k*FA",
      "k=2",
      "INTEGRAL W[0,10] step 0.1 by RKV",
      "OUTPUT FA",
    ].join("\n");
    const [issue] = errors(source).filter((d) => d.code === "E303");
    expect(issue!.args.name).toBe("FA");
  });

  it("accepts a state once it has an initial value", () => {
    const source = [
      "FA'=-k*FA",
      "FA#3",
      "k=2",
      "INTEGRAL W[0,10] step 0.1 by RKV",
      "OUTPUT FA",
    ].join("\n");
    expect(errors(source)).toEqual([]);
  });

  it("reports RESET pointing at an equation without the variable", () => {
    const source = [
      "a=1",
      "b=2",
      "lbl: a+b=c",
      "RESET T # 1 [0,10] BY lbl",
      "T=5",
      "OUTPUT c,T",
    ].join("\n");
    const [issue] = errors(source).filter((d) => d.code === "E304");
    expect(issue!.args).toMatchObject({ name: "T", label: "lbl" });
  });

  it("warns about a circular group with nothing to break it", () => {
    const source = "a=b+1\nb=a*2\nOUTPUT a,b";
    const [issue] = check(source).filter((d) => d.code === "E302");
    expect(issue!.severity).toBe("warning");
    expect(String(issue!.args.names).split(", ").sort()).toEqual(["a", "b"]);
  });

  it("stays quiet once the circular group has a guess", () => {
    const source = "a=b+1\nb=a*2\na#0.5\nOUTPUT a,b";
    expect(check(source).map((d) => d.code)).not.toContain("E302");
  });

  it("does not run structural checks while a name is unresolved", () => {
    const codes = check("a=zzz+1\nOUTPUT a").map((d) => d.code);
    expect(codes).toContain("E200");
    expect(codes).not.toContain("E300");
  });
});
