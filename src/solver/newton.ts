/** A system of equations over `size` unknowns, written as residuals that the
 *  solver drives to zero. */
export type ResidualFunction = (x: readonly number[]) => number[];

export interface NewtonOptions {
  tolerance: number;
  maxIterations: number;
  /** Per-unknown bounds, from a `RESET` clause. */
  lower?: readonly (number | undefined)[];
  upper?: readonly (number | undefined)[];
  /** Per-equation divisor used by the line search only. An energy balance in
   *  J/s and a rate law in mol/s differ by orders of magnitude; without this
   *  the search chases whichever equation carries the larger unit and stalls.
   *  Row scaling leaves the Newton direction untouched. */
  scale?: readonly number[];
}

export interface NewtonResult {
  x: number[];
  residual: number;
  iterations: number;
  converged: boolean;
  reason?: "singular" | "diverged" | "iterations" | "not-a-number";
}

const MIN_STEP_FRACTION = 1 / 64;

/**
 * Damped Newton-Raphson with a numerical Jacobian.
 *
 * The Jacobian uses central differences: rate laws multiply several
 * concentrations together, so a one-sided difference loses too much accuracy
 * near a root to converge tightly. The step is halved until the residual
 * actually falls, which is what keeps a bad initial guess from throwing the
 * iteration out of the physical range.
 *
 * Progress is judged by the scaled Euclidean norm, which moves smoothly enough
 * for a line search and is not dominated by whichever equation carries the
 * larger unit. Convergence is judged on the raw residuals, so the answer is
 * held to an absolute standard rather than to how poor the first guess was.
 */
export function solveNewton(
  residual: ResidualFunction,
  initial: readonly number[],
  options: NewtonOptions,
): NewtonResult {
  const size = initial.length;
  const x = clamp([...initial], options);
  const scaled = (values: readonly number[]): number[] =>
    options.scale === undefined
      ? [...values]
      : values.map((value, index) => value / options.scale![index]!);

  let f = residual(x);
  let worst = infinityNorm(f);
  let merit = euclideanNorm(scaled(f));
  let iterations = 0;

  if (!Number.isFinite(merit)) {
    return {
      x,
      residual: worst,
      iterations,
      converged: false,
      reason: "not-a-number",
    };
  }

  while (worst > options.tolerance && iterations < options.maxIterations) {
    iterations += 1;

    const jacobian = numericalJacobian(residual, x, f);
    const step = solveLinearSystem(jacobian, f.map((value) => -value));
    if (step === undefined) {
      return {
        x,
        residual: worst,
        iterations,
        converged: false,
        reason: "singular",
      };
    }

    let fraction = 1;
    let accepted = false;
    while (fraction >= MIN_STEP_FRACTION) {
      const candidate = clamp(
        x.map((value, index) => value + fraction * step[index]!),
        options,
      );
      const candidateF = residual(candidate);
      const candidateMerit = euclideanNorm(scaled(candidateF));
      if (Number.isFinite(candidateMerit) && candidateMerit < merit) {
        for (let i = 0; i < size; i += 1) x[i] = candidate[i]!;
        f = candidateF;
        merit = candidateMerit;
        worst = infinityNorm(f);
        accepted = true;
        break;
      }
      fraction /= 2;
    }

    if (!accepted) {
      // The line search could not improve on this point. Accept the shortest
      // step tried if it at least stays finite, so a flat patch does not end
      // the solve outright; give up only when even that makes things worse.
      const candidate = clamp(
        x.map((value, index) => value + MIN_STEP_FRACTION * step[index]!),
        options,
      );
      const candidateF = residual(candidate);
      const candidateMerit = euclideanNorm(scaled(candidateF));
      if (!Number.isFinite(candidateMerit) || candidateMerit >= merit) {
        return {
          x,
          residual: worst,
          iterations,
          converged: false,
          reason: "diverged",
        };
      }
      for (let i = 0; i < size; i += 1) x[i] = candidate[i]!;
      f = candidateF;
      merit = candidateMerit;
      worst = infinityNorm(f);
    }
  }

  const converged = worst <= options.tolerance;
  return {
    x,
    residual: worst,
    iterations,
    converged,
    ...(converged ? {} : { reason: "iterations" as const }),
  };
}

function clamp(x: number[], options: NewtonOptions): number[] {
  if (!options.lower && !options.upper) return x;
  return x.map((value, index) => {
    const low = options.lower?.[index];
    const high = options.upper?.[index];
    if (low !== undefined && value < low) return low;
    if (high !== undefined && value > high) return high;
    return value;
  });
}

function euclideanNorm(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value * value;
  return Math.sqrt(total);
}

function infinityNorm(values: readonly number[]): number {
  let largest = 0;
  for (const value of values) {
    const magnitude = Math.abs(value);
    if (!Number.isFinite(magnitude)) return Number.POSITIVE_INFINITY;
    if (magnitude > largest) largest = magnitude;
  }
  return largest;
}

function numericalJacobian(
  residual: ResidualFunction,
  x: readonly number[],
  f: readonly number[],
): number[][] {
  const size = x.length;
  const jacobian: number[][] = Array.from({ length: f.length }, () =>
    new Array<number>(size).fill(0),
  );
  const probe = [...x];
  for (let column = 0; column < size; column += 1) {
    const step = 1e-7 * Math.max(1, Math.abs(x[column]!));
    probe[column] = x[column]! + step;
    const forward = residual(probe);
    probe[column] = x[column]! - step;
    const backward = residual(probe);
    probe[column] = x[column]!;
    for (let row = 0; row < f.length; row += 1) {
      jacobian[row]![column] = (forward[row]! - backward[row]!) / (2 * step);
    }
  }
  return jacobian;
}

/** Gaussian elimination with partial pivoting. Returns undefined when the
 *  matrix is singular, which means the equations do not pin the unknowns down. */
export function solveLinearSystem(
  matrix: readonly (readonly number[])[],
  rhs: readonly number[],
): number[] | undefined {
  const size = rhs.length;
  const a = matrix.map((row, index) => [...row, rhs[index]!]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(a[row]![column]!) > Math.abs(a[pivot]![column]!)) pivot = row;
    }
    const pivotValue = a[pivot]![column]!;
    if (!Number.isFinite(pivotValue) || Math.abs(pivotValue) < 1e-14) {
      return undefined;
    }
    [a[column], a[pivot]] = [a[pivot]!, a[column]!];

    for (let row = column + 1; row < size; row += 1) {
      const factor = a[row]![column]! / a[column]![column]!;
      if (factor === 0) continue;
      for (let k = column; k <= size; k += 1) {
        a[row]![k] = a[row]![k]! - factor * a[column]![k]!;
      }
    }
  }

  const solution = new Array<number>(size).fill(0);
  for (let row = size - 1; row >= 0; row -= 1) {
    let sum = a[row]![size]!;
    for (let column = row + 1; column < size; column += 1) {
      sum -= a[row]![column]! * solution[column]!;
    }
    solution[row] = sum / a[row]![row]!;
  }
  return solution.every(Number.isFinite) ? solution : undefined;
}
