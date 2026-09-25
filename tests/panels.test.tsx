import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { validate } from "../src/lang";
import { solveModel } from "../src/solver/solve";
import { ProblemsPanel } from "../src/ui/ProblemsPanel";
import { ResultsPanel } from "../src/ui/ResultsPanel";
import { TrendChart } from "../src/ui/TrendChart";
import { VariablesPanel } from "../src/ui/VariablesPanel";

const read = (name: string) =>
  readFileSync(new URL(`../samples/${name}`, import.meta.url), "utf8");

describe("panels", () => {
  const model = validate(read("fixed-bed-isothermal.eqs"));

  it("renders the variable map for a real model in both languages", () => {
    for (const locale of ["th", "en"] as const) {
      const html = renderToStaticMarkup(
        <VariablesPanel
          symbols={model.symbols}
          structure={model.structure}
          locale={locale}
          onSelect={() => {}}
        />,
      );
      expect(html).toContain("BedDen");
      expect(html).toContain("52"); // unknowns and equations both balance at 52
    }
  });

  it("marks the independent variable and the states", () => {
    const html = renderToStaticMarkup(
      <VariablesPanel
        symbols={model.symbols}
        structure={model.structure}
        locale="en"
        onSelect={() => {}}
      />,
    );
    expect(html).toContain("role--independent");
    expect(html).toContain("role--state");
  });

  it("renders every diagnostic the checker can produce", () => {
    const broken = validate("a=(1\nRESET # 2 [0,1] BY x\nb=zzz*\n");
    const html = renderToStaticMarkup(
      <ProblemsPanel
        diagnostics={broken.diagnostics}
        locale="th"
        onSelect={() => {}}
      />,
    );
    expect(broken.diagnostics.length).toBeGreaterThan(0);
    expect(html).toContain("problem--error");
  });

  it("says why the variable map is empty when the model has errors", () => {
    const broken = validate("a=zzz+1\nOUTPUT a");
    const html = renderToStaticMarkup(
      <VariablesPanel
        symbols={broken.symbols}
        structure={broken.structure}
        locale="en"
        onSelect={() => {}}
      />,
    );
    expect(html).toContain("varmap--empty");
  });
});

describe("results panel", () => {
  const cstr = validate(read("lec6-cstr.eqs"));
  const solved = solveModel(cstr.program, cstr.symbols, cstr.structure!);

  it("shows the solved outputs and the residual", () => {
    const html = renderToStaticMarkup(
      <ResultsPanel result={solved} locale="en" />,
    );
    expect(html).toContain("Largest residual");
    expect(html).toContain("XA");
  });

  it("shows the trend table for an integrated model", () => {
    const pfr = validate(read("pfr-first-order.eqs"));
    const integrated = solveModel(pfr.program, pfr.symbols, pfr.structure!);
    const html = renderToStaticMarkup(
      <ResultsPanel result={integrated} locale="en" />,
    );
    expect(integrated.converged).toBe(true);
    expect(html).toContain("XA");
  });

  it("explains a runaway solution in Thai rather than naming a method", () => {
    const bed = validate(read("fixed-bed-isothermal.eqs"));
    const attempt = solveModel(bed.program, bed.symbols, bed.structure!);
    const html = renderToStaticMarkup(
      <ResultsPanel result={attempt} locale="th" />,
    );
    expect(html).toContain("ค่าพุ่งไม่มีขอบเขต");
  });

  it("says nothing has been run before the first run", () => {
    const html = renderToStaticMarkup(
      <ResultsPanel result={undefined} locale="en" />,
    );
    expect(html).toContain("results--empty");
  });
});

describe("trend chart", () => {
  const pfr = validate(read("pfr-first-order.eqs"));
  const solved = solveModel(pfr.program, pfr.symbols, pfr.structure!);

  it("draws one panel per trended variable", () => {
    const html = renderToStaticMarkup(
      <TrendChart table={solved.trend!} locale="en" />,
    );
    const panels = html.match(/chart__panel/g) ?? [];
    expect(panels).toHaveLength(solved.trend!.columns.length - 1);
  });

  it("names every panel and its axis, so colour carries nothing alone", () => {
    const html = renderToStaticMarkup(
      <TrendChart table={solved.trend!} locale="en" />,
    );
    for (const column of solved.trend!.columns.slice(1)) {
      expect(html).toContain(`>${column}<`);
    }
    expect(html).toContain("Along V");
  });
});
