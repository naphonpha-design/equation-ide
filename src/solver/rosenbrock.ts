import type { Derivative, IntegrateOptions, IntegrateResult, IntegrationPoint } from "./rk45";
import { solveLinearSystem } from "./newton";

const D = 1 / (2 + Math.SQRT2);
const E32 = 6 + Math.SQRT2;
const MIN_SCALE = 0.2;
const MAX_SCALE = 5;
const SAFETY = 0.9;

/**
 * A stiff integrator: the Rosenbrock method of Shampine and Reichelt, the one
 * behind MATLAB's `ode23s`.
 *
 * Reactor models written with laboratory rate constants are routinely stiff —
 * a packed bed can consume its limiting reactant within a millionth of the
 * bed — and an explicit method answers that by shrinking its step towards
 * zero. This one is A-stable, so it takes the step the accuracy needs rather
 * than the one stability allows. Each step costs one Jacobian and one matrix
 * factorisation, which for a handful of states is cheap.
 */
export function integrateStiff(
  derivative: Derivative,
  initial: readonly number[],
  options: IntegrateOptions,
): IntegrateResult {
  // Looser than the explicit method: this one's error estimate is a lower
  // order, so chasing the same figure would cost far more steps for little.
  const relative = options.relativeTolerance ?? 1e-8;
  const absolute = options.absoluteTolerance ?? 1e-11;
  const maxSteps = options.maxSteps ?? 20_000;
  const size = initial.length;
  const stops = [...(options.stops ?? [])].filter(
    (stop) => stop > options.from && stop <= options.to,
  );

  let t = options.from;
  let y = [...initial];
  let step = Math.max(Math.abs(options.initialStep), 1e-12);
  let steps = 0;
  let rejected = 0;
  let nextStop = 0;

  const points: IntegrationPoint[] = [{ t, y: [...y] }];
  const fail = (message: string): IntegrateResult => ({
    points,
    steps,
    rejected,
    completed: false,
    failure: { message, t },
  });

  while (t < options.to - 1e-14) {
    if (steps >= maxSteps) return fail("too many steps");

    const limit = Math.min(options.to, stops[nextStop] ?? Number.POSITIVE_INFINITY);
    const h = Math.min(step, limit - t);
    if (h <= 0) return fail("step collapsed to zero");

    const f0 = derivative(t, y);
    if (!f0.every(Number.isFinite)) return fail("derivative is not a number");

    const jacobian = jacobianOf(derivative, t, y, f0);
    const timeDerivative = timeSlope(derivative, t, y, f0, options);

    // W = I - h*d*J, factorised once and reused for all three stages.
    const w = jacobian.map((row, i) =>
      row.map((value, j) => (i === j ? 1 : 0) - h * D * value),
    );

    const k1 = solveLinearSystem(
      w,
      f0.map((value, index) => value + h * D * timeDerivative[index]!),
    );
    if (k1 === undefined) return fail("the Jacobian is singular");

    const y1 = y.map((value, index) => value + 0.5 * h * k1[index]!);
    const f1 = derivative(t + 0.5 * h, y1);
    const k2raw = solveLinearSystem(
      w,
      f1.map((value, index) => value - k1[index]!),
    );
    if (k2raw === undefined) return fail("the Jacobian is singular");
    const k2 = k2raw.map((value, index) => value + k1[index]!);

    const yNext = y.map((value, index) => value + h * k2[index]!);
    if (!yNext.every(Number.isFinite)) return fail("solution is not a number");

    const f2 = derivative(t + h, yNext);
    const k3raw = solveLinearSystem(
      w,
      f2.map(
        (value, index) =>
          value -
          E32 * (k2[index]! - f1[index]!) -
          2 * (k1[index]! - f0[index]!) +
          h * D * timeDerivative[index]!,
      ),
    );
    if (k3raw === undefined) return fail("the Jacobian is singular");

    let error = 0;
    for (let index = 0; index < size; index += 1) {
      const estimate =
        (h / 6) * (k1[index]! - 2 * k2[index]! + k3raw[index]!);
      const scale =
        absolute +
        relative * Math.max(Math.abs(y[index]!), Math.abs(yNext[index]!));
      const ratio = Math.abs(estimate) / scale;
      if (ratio > error) error = ratio;
    }
    if (!Number.isFinite(error)) return fail("error estimate is not a number");

    if (error <= 1) {
      t += h;
      y = yNext;
      steps += 1;
      if (stops[nextStop] !== undefined && Math.abs(t - stops[nextStop]!) < 1e-12) {
        nextStop += 1;
      }
      points.push({ t, y: [...y] });
    } else {
      rejected += 1;
    }

    const scale =
      error === 0
        ? MAX_SCALE
        : Math.min(MAX_SCALE, Math.max(MIN_SCALE, SAFETY * error ** (-1 / 3)));
    step = h * scale;
  }

  return { points, steps, rejected, completed: true };
}

function jacobianOf(
  derivative: Derivative,
  t: number,
  y: readonly number[],
  f0: readonly number[],
): number[][] {
  const size = y.length;
  const jacobian: number[][] = Array.from({ length: size }, () =>
    new Array<number>(size).fill(0),
  );
  const probe = [...y];
  for (let column = 0; column < size; column += 1) {
    const delta = Math.sqrt(Number.EPSILON) * Math.max(1, Math.abs(y[column]!));
    probe[column] = y[column]! + delta;
    const forward = derivative(t, probe);
    probe[column] = y[column]!;
    for (let row = 0; row < size; row += 1) {
      jacobian[row]![column] = (forward[row]! - f0[row]!) / delta;
    }
  }
  return jacobian;
}

function timeSlope(
  derivative: Derivative,
  t: number,
  y: readonly number[],
  f0: readonly number[],
  options: IntegrateOptions,
): number[] {
  const delta =
    Math.sqrt(Number.EPSILON) * Math.max(Math.abs(t), Math.abs(options.to - options.from));
  const forward = derivative(t + delta, y);
  return f0.map((value, index) => (forward[index]! - value) / delta);
}
