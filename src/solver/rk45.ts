/** The right-hand side of `dy/dt = f(t, y)`. */
export type Derivative = (t: number, y: readonly number[]) => number[];

export interface IntegrateOptions {
  from: number;
  to: number;
  /** First step to try. The step adapts from here. */
  initialStep: number;
  relativeTolerance?: number;
  absoluteTolerance?: number;
  /** Points the integrator must land on exactly, in increasing order. */
  stops?: readonly number[];
  maxSteps?: number;
}

export interface IntegrationPoint {
  t: number;
  y: number[];
}

export interface IntegrateResult {
  points: IntegrationPoint[];
  steps: number;
  rejected: number;
  completed: boolean;
  failure?: { message: string; t: number };
}

// Dormand-Prince 5(4). The fifth-order solution advances the integration and
// the fourth-order one only estimates the error, which is what lets the step
// grow over the flat stretches of a reactor profile and shrink where the
// pressure drop turns sharply.
const A: readonly (readonly number[])[] = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
];
const C: readonly number[] = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const B5: readonly number[] = [
  35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0,
];
const B4: readonly number[] = [
  5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100,
  1 / 40,
];

const MIN_SCALE = 0.2;
const MAX_SCALE = 5;
const SAFETY = 0.9;

/**
 * Integrates an initial value problem with adaptive Dormand-Prince steps.
 *
 * Steps never cross a point listed in `stops`: the step is shortened to land
 * on it exactly, so recorded values are the real solution there rather than
 * an interpolation.
 */
export function integrate(
  derivative: Derivative,
  initial: readonly number[],
  options: IntegrateOptions,
): IntegrateResult {
  // Tight by default: a profile that will be read off a chart or compared
  // against another solver should not carry visible truncation error.
  const relative = options.relativeTolerance ?? 1e-9;
  const absolute = options.absoluteTolerance ?? 1e-12;
  const maxSteps = options.maxSteps ?? 20_000;
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

  let k0 = derivative(t, y);
  if (!k0.every(Number.isFinite)) return fail("derivative is not a number");

  while (t < options.to - 1e-14) {
    if (steps >= maxSteps) return fail("too many steps");

    const limit = Math.min(
      options.to,
      stops[nextStop] ?? Number.POSITIVE_INFINITY,
    );
    const h = Math.min(step, limit - t);
    if (h <= 0) return fail("step collapsed to zero");
    // A step this small against the span of the run means the solution is
    // changing far faster than an explicit method can follow — stiffness.
    if (h < (options.to - options.from) * 1e-11) return fail("stiff");

    const k: number[][] = [k0];
    for (let stage = 1; stage < 7; stage += 1) {
      const yStage = y.map((value, index) => {
        let sum = value;
        for (let previous = 0; previous < stage; previous += 1) {
          const weight = A[stage]![previous]!;
          if (weight !== 0) sum += h * weight * k[previous]![index]!;
        }
        return sum;
      });
      k.push(derivative(t + C[stage]! * h, yStage));
    }

    const fifth = y.map((value, index) => {
      let sum = value;
      for (let stage = 0; stage < 7; stage += 1) {
        if (B5[stage] !== 0) sum += h * B5[stage]! * k[stage]![index]!;
      }
      return sum;
    });
    const fourth = y.map((value, index) => {
      let sum = value;
      for (let stage = 0; stage < 7; stage += 1) {
        if (B4[stage] !== 0) sum += h * B4[stage]! * k[stage]![index]!;
      }
      return sum;
    });

    if (!fifth.every(Number.isFinite)) return fail("solution is not a number");

    // Error relative to each component's own size, so a flow of 3 mol/s and a
    // pressure of 2e6 Pa are held to the same standard.
    let error = 0;
    for (let index = 0; index < y.length; index += 1) {
      const scale =
        absolute +
        relative * Math.max(Math.abs(y[index]!), Math.abs(fifth[index]!));
      const ratio = Math.abs(fifth[index]! - fourth[index]!) / scale;
      if (ratio > error) error = ratio;
    }

    if (error <= 1) {
      t = t + h;
      y = fifth;
      steps += 1;
      // FSAL: the last stage of an accepted step is the first of the next.
      k0 = k[6]!;
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
        : Math.min(MAX_SCALE, Math.max(MIN_SCALE, SAFETY * error ** -0.2));
    step = h * scale;
  }

  return { points, steps, rejected, completed: true };
}
