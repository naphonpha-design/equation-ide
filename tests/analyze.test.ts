import { describe, expect, it } from "vitest";
import { validate } from "../src/lang";
import type { Diagnostic } from "../src/lang";

const check = (source: string): Diagnostic[] => validate(source).diagnostics;
const codes = (source: string) => check(source).map((d) => d.code);
const errors = (source: string) =>
  check(source).filter((d) => d.severity === "error").map((d) => d.code);

describe("semantic analysis", () => {
  it("accepts a model where every name has an equation", () => {
    expect(errors("a=1\nb=a*2\nOUTPUT b")).toEqual([]);
  });

  it("reports a variable no equation defines", () => {
    const [issue] = check("DCP1=3*CPD+CPC\nCPD=18\nOUTPUT DCP1");
    expect(issue).toMatchObject({ code: "E200", args: { name: "CPC" } });
    expect(issue!.span.start.line).toBe(1);
  });

  it("suggests a near-miss name", () => {
    const [issue] = check("BedDen=600\nz=W/(BeDDen)\nW=1\nOUTPUT z").filter(
      (d) => d.code === "E200",
    );
    expect(issue!.args).toMatchObject({ name: "BeDDen", suggestion: "BedDen" });
  });

  it("treats an implicit equation as defining its variables", () => {
    expect(errors("PF=20\nFT0=3\nR=8.314\nPF*v0=FT0*R\nOUTPUT v0")).toEqual([]);
  });

  it("does not call an implicit equation a duplicate definition", () => {
    expect(codes("a=1\nb=2\nlbl: a+b=c*2\nc=3\nOUTPUT c")).not.toContain("E205");
  });

  it("warns when a variable is assigned twice", () => {
    const issues = check("a=1\na=2\nOUTPUT a");
    expect(issues.map((d) => d.code)).toContain("E205");
    expect(issues[0]!.severity).toBe("warning");
  });

  it("warns about a variable nothing reads", () => {
    expect(codes("a=1\nb=2\nOUTPUT b")).toContain("E206");
  });

  it("reports an unknown function and suggests the right one", () => {
    const [issue] = check("y=exq(2)\nOUTPUT y");
    expect(issue).toMatchObject({ code: "E201", args: { suggestion: "EXP" } });
  });

  it("accepts builtin functions in any case", () => {
    expect(errors("y=Exp(1)+MAX(1,2)+sqrt(4)\nOUTPUT y")).toEqual([]);
  });

  it("reports the wrong number of arguments", () => {
    expect(errors("y=MAX(1)\nOUTPUT y")).toContain("E202");
  });

  it("reports BY pointing at a label that does not exist", () => {
    const source = "T=1\nebal: T+1=2\nRESET T # 150 [40,400] BY ebl\nOUTPUT T";
    const [issue] = check(source).filter((d) => d.code === "E203");
    expect(issue!.args).toMatchObject({ name: "ebl", suggestion: "ebal" });
  });

  it("accepts BY pointing at a real label", () => {
    const source = "Q=0\nT=1\nebal: Q+T=2\nRESET T # 150 [40,400] BY ebal\nOUTPUT T";
    expect(errors(source)).toEqual([]);
  });

  it("reports duplicate labels", () => {
    expect(errors("e: 1=a\ne: 2=b\nOUTPUT a,b")).toContain("E204");
  });

  it("reports a derivative with no INTEGRAL", () => {
    expect(errors("FA'=-1\nFA#3\nOUTPUT FA")).toContain("E208");
  });

  it("accepts a derivative once INTEGRAL is present", () => {
    const source = "FA'=-1\nFA#3\nINTEGRAL W[0,10] step 0.1 by RKV\nOUTPUT FA";
    expect(errors(source)).toEqual([]);
  });

  it("reports a second INTEGRAL", () => {
    const source = [
      "FA'=-1",
      "FA#3",
      "INTEGRAL W[0,10] step 0.1 by RKV",
      "INTEGRAL V[0,10] step 0.1 by RKV",
      "OUTPUT FA",
    ].join("\n");
    expect(errors(source)).toContain("E209");
  });

  it("reports an OUTPUT name that is not in the model", () => {
    const [issue] = check("a=1\nOUTPUT a,bb").filter((d) => d.code === "E207");
    expect(issue!.args.name).toBe("bb");
  });

  it("warns about a self-referential assignment", () => {
    expect(codes("x=x+1\nOUTPUT x")).toContain("E211");
  });

  it("stays quiet about semantics while the syntax is broken", () => {
    const codesFound = codes("a=(1\nOUTPUT zzz");
    expect(codesFound).toContain("E103");
    expect(codesFound).not.toContain("E207");
  });

  it("classifies variables by role", () => {
    const { symbols } = validate(
      "FA'=-1\nFA#3\nk=2\nINTEGRAL W[0,10] step 0.1 by RKV\nOUTPUT FA,k",
    );
    expect(symbols.variables.get("W")!.role).toBe("independent");
    expect(symbols.variables.get("FA")!.role).toBe("state");
    expect(symbols.variables.get("k")!.role).toBe("algebraic");
  });
});
