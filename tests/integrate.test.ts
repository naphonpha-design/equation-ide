import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validate } from "../src/lang";
import { solveModel } from "../src/solver/solve";
import { integrate } from "../src/solver/rk45";
import { integrateStiff } from "../src/solver/rosenbrock";

const read = (name: string) =>
  readFileSync(new URL(`../samples/${name}`, import.meta.url), "utf8");

const run = (source: string) => {
  const { program, symbols, structure } = validate(source);
  if (!structure) throw new Error("model did not validate");
  return solveModel(program, symbols, structure);
};

describe("the explicit integrator", () => {
  it("reproduces exponential decay", () => {
    const result = integrate((_, y) => [-y[0]!], [1], {
      from: 0,
      to: 5,
      initialStep: 0.1,
    });
    expect(result.completed).toBe(true);
    const final = result.points[result.points.length - 1]!;
    expect(final.t).toBeCloseTo(5, 12);
    expect(final.y[0]).toBeCloseTo(Math.exp(-5), 9);
  });

  it("follows a system whose components differ in size", () => {
    // y1' = y2, y2' = -y1  =>  a circle of radius 1.
    const result = integrate((_, y) => [y[1]!, -y[0]!], [1, 0], {
      from: 0,
      to: 2 * Math.PI,
      initialStep: 0.1,
    });
    const final = result.points[result.points.length - 1]!;
    expect(final.y[0]).toBeCloseTo(1, 7);
    expect(final.y[1]).toBeCloseTo(0, 7);
  });

  it("lands exactly on the points it is asked to stop at", () => {
    const result = integrate((_, y) => [-y[0]!], [1], {
      from: 0,
      to: 1,
      initialStep: 0.5,
      stops: [0.25, 0.5, 0.75],
    });
    for (const stop of [0.25, 0.5, 0.75]) {
      expect(result.points.some((point) => Math.abs(point.t - stop) < 1e-12)).toBe(
        true,
      );
    }
  });

  it("gives up on a stiff problem rather than crawling for ever", () => {
    const result = integrate(
      (t, y) => [-1e6 * (y[0]! - Math.cos(t))],
      [0],
      { from: 0, to: 10, initialStep: 0.1 },
    );
    expect(result.completed).toBe(false);
  });
});

describe("the stiff integrator", () => {
  it("solves a stiff problem the explicit method cannot", () => {
    // y' = -1000(y - cos t) - sin t, y(0) = 1  =>  y = cos t exactly.
    const result = integrateStiff(
      (t, y) => [-1000 * (y[0]! - Math.cos(t)) - Math.sin(t)],
      [1],
      { from: 0, to: 3, initialStep: 0.01, relativeTolerance: 1e-8 },
    );
    expect(result.completed).toBe(true);
    const final = result.points[result.points.length - 1]!;
    expect(final.y[0]).toBeCloseTo(Math.cos(3), 6);
  });

  it("agrees with the explicit method on a non-stiff problem", () => {
    const options = { from: 0, to: 2, initialStep: 0.1 } as const;
    const explicit = integrate((_, y) => [-y[0]!], [1], options);
    const stiff = integrateStiff((_, y) => [-y[0]!], [1], options);
    const a = explicit.points[explicit.points.length - 1]!.y[0]!;
    const b = stiff.points[stiff.points.length - 1]!.y[0]!;
    expect(b).toBeCloseTo(a, 6);
  });
});

describe("the PFR reference model", () => {
  const result = run(read("pfr-first-order.eqs"));
  const analytic = (v: number) => 5 * Math.exp((-0.8 * v) / 0.5);

  it("runs to the end of the bed", () => {
    expect(result.failure).toBeUndefined();
    expect(result.converged).toBe(true);
  });

  it("matches the analytic outlet flow", () => {
    const FA = result.outputs.find((output) => output.name === "FA")!.value;
    expect(FA).toBeCloseTo(analytic(2), 8);
  });

  it("matches the analytic conversion", () => {
    const XA = result.outputs.find((output) => output.name === "XA")!.value;
    expect(XA).toBeCloseTo(1 - Math.exp(-3.2), 8);
  });

  it("conserves total moles: what A loses, B gains", () => {
    const value = (name: string) =>
      result.outputs.find((output) => output.name === name)!.value;
    expect(value("FA") + value("FB")).toBeCloseTo(5, 8);
  });

  it("records the trend at the interval the model asked for", () => {
    const trend = result.trend!;
    expect(trend.independent).toBe("V");
    expect(trend.columns).toEqual(["V", "CA", "FA", "FB", "XA"]);
    expect(trend.rows.map((row) => row[0])).toEqual([
      0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2,
    ]);
  });

  it("records values that match the analytic solution along the way", () => {
    for (const row of result.trend!.rows) {
      const [v, ca, fa] = row as [number, number, number];
      expect(fa).toBeCloseTo(analytic(v), 7);
      expect(ca).toBeCloseTo(analytic(v) / 0.5, 7);
    }
  });

  it("solves the algebraic subsystem at every recorded point", () => {
    expect(result.maxResidual).toBeLessThan(1e-9);
  });
});

describe("a model whose solution runs away", () => {
  const result = run(read("fixed-bed-isothermal.eqs"));

  it("says where it stopped and what was happening there", () => {
    expect(result.failure?.kind).toBe("integration");
    const failure = result.failure as { detail?: string; at: number };
    expect(failure.detail).toMatch(/F[A-F]=-/); // a molar flow has gone negative
    expect(failure.at).toBeGreaterThan(0);
  });

  it("reports having tried the stiff method before giving up", () => {
    expect(result.log.join("\n")).toContain("stiff");
  });
});
