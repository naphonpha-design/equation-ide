import type { Expression, Program } from "../lang/ast";
import { walkExpression } from "../lang/ast";
import type { ModelStructure, ModelSymbols } from "../lang";
import { condense } from "../lang/structure";
import { EvaluationError, evaluate } from "./evaluate";
import { solveNewton } from "./newton";
import { integrate } from "./rk45";
import { integrateStiff } from "./rosenbrock";

export interface SolveOptions {
  tolerance?: number;
  maxIterations?: number;
}

export interface BlockReport {
  variables: string[];
  /** True when the block was a plain assignment needing no iteration. */
  direct: boolean;
  iterations: number;
  residual: number;
  converged: boolean;
  reason?: string;
}

export interface SolvedValue {
  name: string;
  value: number;
}

/** Values of the `trend` variables along the independent variable. */
export interface TrendTable {
  independent: string;
  columns: string[];
  rows: number[][];
}

export type SolveFailure =
  | { kind: "unbalanced" }
  | { kind: "block-failed"; variables: string[]; reason: string }
  | { kind: "evaluation"; message: string; variable?: string }
  | {
      kind: "integration";
      message: string;
      at: number;
      /** What the states were doing when it stopped, which is usually the
       *  whole explanation. */
      detail?: string;
    };

export interface SolveResult {
  values: Map<string, number>;
  outputs: SolvedValue[];
  blocks: BlockReport[];
  converged: boolean;
  /** Largest residual across every equation, as a trustworthiness signal. */
  maxResidual: number;
  failure?: SolveFailure;
  /** Plain-text transcript, for the raw console view. */
  log: string[];
  trend?: TrendTable;
  integration?: { steps: number; rejected: number; method: string };
}

interface Guess {
  value?: Expression;
  lower?: Expression;
  upper?: Expression;
}

/** One block of the solution sequence: a group of unknowns that has to be
 *  worked out together, and how. */
interface BlockPlan {
  component: string[];
  direct: boolean;
  /** Unknowns the block iterates on. Empty for a direct block. */
  torn: string[];
  /** Order to evaluate the remaining unknowns in, once the torn ones are set. */
  ordered: string[] | undefined;
  /** Equations whose residuals drive the iteration. */
  residualEquations: number[];
  /** True when the block has to be re-solved at every integration step. */
  varying: boolean;
}

function collectGuesses(program: Program): Map<string, Guess> {
  const guesses = new Map<string, Guess>();
  const at = (name: string): Guess => {
    let guess = guesses.get(name);
    if (guess === undefined) {
      guess = {};
      guesses.set(name, guess);
    }
    return guess;
  };
  for (const statement of program.statements) {
    if (statement.kind === "initial") {
      at(statement.target.name).value = statement.expression;
    }
    if (statement.kind === "reset") {
      const guess = at(statement.target.name);
      guess.value = statement.guess;
      guess.lower = statement.lower;
      guess.upper = statement.upper;
    }
  }
  return guesses;
}

function mentionsAny(
  expression: Expression,
  names: ReadonlySet<string>,
): boolean {
  let found = false;
  walkExpression(expression, (node) => {
    if (node.kind === "variable" && names.has(node.name)) found = true;
  });
  return found;
}

function mentions(expression: Expression, name: string): boolean {
  return mentionsAny(expression, new Set([name]));
}

/**
 * Works out the order to solve the algebraic system in, and which blocks
 * change as integration proceeds.
 *
 * Blocks that mention neither a state nor the independent variable are
 * constant for the whole run — feed rates, bed geometry, rate constants at a
 * fixed temperature — so they are solved once instead of at every step.
 */
function buildPlan(
  structure: ModelStructure,
  equationStatements: { left: Expression; right: Expression }[],
  guesses: ReadonlyMap<string, Guess>,
): BlockPlan[] {
  const changing = new Set<string>(structure.states);
  if (structure.independent !== undefined) changing.add(structure.independent);

  const varyingUnknowns = new Set<string>();
  const { components } = condense(
    structure.unknowns,
    structure.equations,
    structure.matching,
  );

  return components.map((component) => {
    const equationIndices = component.map(
      (name) => structure.matching.get(name)!,
    );

    const varying = equationIndices.some((index) => {
      const statement = equationStatements[index]!;
      if (
        mentionsAny(statement.left, changing) ||
        mentionsAny(statement.right, changing)
      ) {
        return true;
      }
      return structure.equations[index]!.unknowns.some(
        (input) => !component.includes(input) && varyingUnknowns.has(input),
      );
    });
    if (varying) for (const name of component) varyingUnknowns.add(name);

    if (component.length === 1) {
      const name = component[0]!;
      const slot = structure.equations[equationIndices[0]!]!;
      const statement = equationStatements[equationIndices[0]!]!;
      const selfReferential =
        statement.left.kind !== "variable" || mentions(statement.right, name);
      if (slot.preferred === name && !selfReferential) {
        return {
          component,
          direct: true,
          torn: [],
          ordered: undefined,
          residualEquations: equationIndices,
          varying,
        };
      }
    }

    // A circular block is torn at the variables the model already marks with
    // a `#` guess: that is what those lines are for. The rest of the block is
    // then substituted forward from them.
    const torn = component.filter(
      (name) => guesses.get(name)?.value !== undefined,
    );
    const rest = component.filter((name) => !torn.includes(name));
    const substitutable = rest.every((name) => {
      const index = structure.matching.get(name)!;
      return (
        structure.equations[index]!.preferred === name &&
        !mentions(equationStatements[index]!.right, name)
      );
    });
    const ordered = substitutable
      ? orderForSubstitution(rest, structure)
      : undefined;
    const iterate = torn.length > 0 && ordered !== undefined ? torn : component;

    return {
      component,
      direct: false,
      torn: iterate,
      ordered: torn.length > 0 && ordered !== undefined ? ordered : undefined,
      residualEquations: iterate.map((name) => structure.matching.get(name)!),
      varying,
    };
  });
}

/** Runs one pass over a list of blocks, filling `values` as it goes. */
function runBlocks(
  plans: readonly BlockPlan[],
  context: {
    values: Map<string, number>;
    structure: ModelStructure;
    equationStatements: { left: Expression; right: Expression }[];
    guesses: ReadonlyMap<string, Guess>;
    tolerance: number;
    maxIterations: number;
    reports?: BlockReport[];
    log?: string[];
  },
): { variables: string[]; reason: string } | undefined {
  const { values, structure, equationStatements, guesses } = context;

  const residualOf = (index: number): number => {
    const statement = equationStatements[index]!;
    return evaluate(statement.left, values) - evaluate(statement.right, values);
  };

  for (const plan of plans) {
    if (plan.direct) {
      const name = plan.component[0]!;
      const statement = equationStatements[plan.residualEquations[0]!]!;
      values.set(name, evaluate(statement.right, values));
      context.reports?.push({
        variables: [name],
        direct: true,
        iterations: 0,
        residual: 0,
        converged: true,
      });
      continue;
    }

    const substitute = (): void => {
      if (plan.ordered === undefined) return;
      for (const name of plan.ordered) {
        const statement = equationStatements[structure.matching.get(name)!]!;
        values.set(name, evaluate(statement.right, values));
      }
    };

    const blockResidual = (x: readonly number[]): number[] => {
      plan.torn.forEach((name, index) => values.set(name, x[index]!));
      substitute();
      return plan.residualEquations.map(residualOf);
    };

    const start = plan.torn.map((name) => {
      const guess = guesses.get(name)?.value;
      const previous = values.get(name);
      if (previous !== undefined && Number.isFinite(previous)) return previous;
      if (guess === undefined) return 1;
      try {
        return evaluate(guess, values);
      } catch {
        return 1;
      }
    });
    const bound = (pick: (guess: Guess) => Expression | undefined) =>
      plan.torn.map((name) => {
        const expression = guesses.get(name) && pick(guesses.get(name)!);
        if (expression === undefined) return undefined;
        try {
          return evaluate(expression, values);
        } catch {
          return undefined;
        }
      });

    // Fix the row scaling at the starting point so comparisons between
    // iterations stay meaningful.
    const scale = blockResidual(start).map((value) =>
      Number.isFinite(value) ? Math.max(1, Math.abs(value)) : 1,
    );

    const result = solveNewton(blockResidual, start, {
      tolerance: context.tolerance,
      maxIterations: context.maxIterations,
      lower: bound((guess) => guess.lower),
      upper: bound((guess) => guess.upper),
      scale,
    });

    plan.torn.forEach((name, index) => values.set(name, result.x[index]!));
    substitute();

    context.reports?.push({
      variables: plan.component,
      direct: false,
      iterations: result.iterations,
      residual: result.residual,
      converged: result.converged,
      ...(result.reason ? { reason: result.reason } : {}),
    });
    context.log?.push(
      `${plan.component.length} variables, torn at ${plan.torn.join(", ")}: ` +
        `${result.iterations} iterations, residual ${result.residual.toExponential(3)}`,
    );

    if (!result.converged) {
      return {
        variables: plan.component,
        reason: result.reason ?? "iterations",
      };
    }
  }
  return undefined;
}

/**
 * Solves a model: a plain algebraic system, or — when it has derivative
 * equations — a differential-algebraic one, where the algebraic subsystem is
 * re-solved at every step of the integration.
 */
export function solveModel(
  program: Program,
  symbols: ModelSymbols,
  structure: ModelStructure,
  options: SolveOptions = {},
): SolveResult {
  const tolerance = options.tolerance ?? 1e-9;
  const maxIterations = options.maxIterations ?? 200;
  const log: string[] = [];
  const values = new Map<string, number>();
  const blocks: BlockReport[] = [];

  const fail = (failure: SolveFailure): SolveResult => ({
    values,
    outputs: [],
    blocks,
    converged: false,
    maxResidual: Number.NaN,
    failure,
    log,
  });

  if (
    structure.unmatchedUnknowns.length > 0 ||
    structure.unmatchedEquations.length > 0
  ) {
    return fail({ kind: "unbalanced" });
  }

  // `structure.equations` is collected in statement order, so the equation
  // statements line up one for one.
  const equationStatements = program.statements.filter(
    (statement) => statement.kind === "equation",
  );
  const guesses = collectGuesses(program);
  const plans = buildPlan(structure, equationStatements, guesses);
  const context = {
    values,
    structure,
    equationStatements,
    guesses,
    tolerance,
    maxIterations,
  };

  const residualOf = (index: number): number => {
    const statement = equationStatements[index]!;
    return evaluate(statement.left, values) - evaluate(statement.right, values);
  };

  const finish = (extra: Partial<SolveResult> = {}): SolveResult => {
    let maxResidual = 0;
    for (let index = 0; index < structure.equations.length; index += 1) {
      const value = Math.abs(residualOf(index));
      if (value > maxResidual) maxResidual = value;
    }
    const outputs = symbols.outputs.map((ref) => ({
      name: ref.name,
      value: values.get(ref.name) ?? Number.NaN,
    }));
    return {
      values,
      outputs,
      blocks,
      converged: true,
      maxResidual,
      log,
      ...extra,
    };
  };

  try {
    if (structure.states.length === 0) {
      const failure = runBlocks(plans, { ...context, reports: blocks, log });
      if (failure) return fail({ kind: "block-failed", ...failure });
      return finish();
    }
    return integrateModel(
      program,
      symbols,
      structure,
      plans,
      context,
      blocks,
      log,
      fail,
      finish,
    );
  } catch (error) {
    if (error instanceof EvaluationError) {
      return fail({
        kind: "evaluation",
        message: error.message,
        ...(error.variable ? { variable: error.variable } : {}),
      });
    }
    throw error;
  }
}

function integrateModel(
  program: Program,
  symbols: ModelSymbols,
  structure: ModelStructure,
  plans: readonly BlockPlan[],
  context: Parameters<typeof runBlocks>[1],
  blocks: BlockReport[],
  log: string[],
  fail: (failure: SolveFailure) => SolveResult,
  finish: (extra?: Partial<SolveResult>) => SolveResult,
): SolveResult {
  const { values } = context;
  const integral = program.statements.find(
    (statement) => statement.kind === "integral",
  );
  if (integral === undefined || integral.kind !== "integral") {
    // Guaranteed by validation E208, which runs before this.
    return fail({ kind: "integration", message: "no INTEGRAL statement", at: 0 });
  }

  const constantBlocks = plans.filter((plan) => !plan.varying);
  const varyingBlocks = plans.filter((plan) => plan.varying);

  // Constants first: the initial conditions are written in terms of them.
  const constantFailure = runBlocks(constantBlocks, {
    ...context,
    reports: blocks,
    log,
  });
  if (constantFailure) {
    return fail({ kind: "block-failed", ...constantFailure });
  }

  const states = structure.states;
  const derivatives = new Map<string, Expression>();
  const initials = new Map<string, Expression>();
  for (const statement of program.statements) {
    if (statement.kind === "derivative") {
      derivatives.set(statement.target.name, statement.expression);
    }
    if (statement.kind === "initial") {
      initials.set(statement.target.name, statement.expression);
    }
  }

  const from = evaluate(integral.lower, values);
  const to = evaluate(integral.upper, values);
  const declaredStep = integral.step
    ? evaluate(integral.step, values)
    : (to - from) / 100;
  const method = integral.method?.name ?? "RKV";

  values.set(structure.independent!, from);
  const initialState = states.map((name) => evaluate(initials.get(name)!, values));

  let blockFailure: { variables: string[]; reason: string } | undefined;

  /** Solves the algebraic subsystem at one point of the integration. */
  const settle = (t: number, y: readonly number[]): boolean => {
    values.set(structure.independent!, t);
    states.forEach((name, index) => values.set(name, y[index]!));
    const failure = runBlocks(varyingBlocks, context);
    if (failure) {
      blockFailure = failure;
      return false;
    }
    return true;
  };

  const derivative = (t: number, y: readonly number[]): number[] => {
    if (!settle(t, y)) return states.map(() => Number.NaN);
    return states.map((name) => evaluate(derivatives.get(name)!, values));
  };

  const trendStatement = program.statements.find(
    (statement) => statement.kind === "trend",
  );
  const trendStep =
    trendStatement?.kind === "trend" && trendStatement.step
      ? evaluate(trendStatement.step, values)
      : undefined;

  const stops: number[] = [];
  if (trendStep !== undefined && trendStep > 0) {
    for (let stop = from + trendStep; stop < to; stop += trendStep) {
      stops.push(stop);
    }
  }

  const settings = {
    from,
    to,
    initialStep: Math.abs(declaredStep) || (to - from) / 100,
    stops,
  };

  let run = integrate(derivative, initialState, settings);
  let usedMethod = method;

  // An explicit method answers stiffness by shrinking its step towards zero.
  // Rather than report that as a failure, switch to the stiff method and say
  // so: a reactor model written with laboratory rate constants is routinely
  // stiff, and the author wants the profile, not a lecture about methods.
  const stalled =
    !run.completed &&
    ["stiff", "too many steps", "step collapsed to zero"].includes(
      run.failure?.message ?? "",
    );
  if (stalled) {
    log.push(
      `${method} could not advance past ${structure.independent}=${run.failure!.t.toPrecision(4)} — ` +
        "the system is stiff; retrying with the Rosenbrock stiff method",
    );
    blockFailure = undefined;
    run = integrateStiff(derivative, initialState, settings);
    usedMethod = `${method} → Rosenbrock (stiff)`;
  }

  if (blockFailure) return fail({ kind: "block-failed", ...blockFailure });
  if (!run.completed) {
    return fail({
      kind: "integration",
      message: run.failure?.message ?? "integration stopped",
      at: run.failure?.t ?? from,
      ...describeRunaway(states, run.points[run.points.length - 1], derivative),
    });
  }

  log.push(
    `${usedMethod}: ${run.steps} steps accepted, ${run.rejected} rejected, ` +
      `${structure.independent} from ${from} to ${to}`,
  );

  // Record the trend table from the accepted points, re-solving the algebraic
  // subsystem at each so the recorded columns are the real values there.
  const columns = symbols.trends.map((ref) => ref.name);
  let trend: TrendTable | undefined;
  if (columns.length > 0) {
    const wanted =
      stops.length > 0
        ? run.points.filter(
            (point) =>
              point.t === from ||
              point.t === to ||
              stops.some((stop) => Math.abs(point.t - stop) < 1e-12),
          )
        : run.points;
    const rows: number[][] = [];
    for (const point of wanted) {
      if (!settle(point.t, point.y)) break;
      rows.push([point.t, ...columns.map((name) => values.get(name) ?? Number.NaN)]);
    }
    trend = {
      independent: structure.independent!,
      columns: [structure.independent!, ...columns],
      rows,
    };
  }

  // Leave the model standing at the end of the run, which is what OUTPUT reports.
  const last = run.points[run.points.length - 1]!;
  if (!settle(last.t, last.y)) {
    return fail({ kind: "block-failed", ...blockFailure! });
  }

  return finish({
    ...(trend ? { trend } : {}),
    integration: { steps: run.steps, rejected: run.rejected, method: usedMethod },
  });
}

/**
 * Orders the variables of a torn block so each one can be evaluated from
 * values already known. Kahn's algorithm over the edges the matching implies,
 * counting only edges between members of `names`.
 *
 * Returns undefined when a cycle survives, which means the tear variables
 * were not enough to break the block.
 */
function orderForSubstitution(
  names: readonly string[],
  structure: ModelStructure,
): string[] | undefined {
  const inside = new Set(names);
  const predecessors = new Map<string, Set<string>>();
  const successors = new Map<string, string[]>();
  for (const name of names) {
    predecessors.set(name, new Set());
    successors.set(name, []);
  }
  for (const name of names) {
    const slot = structure.equations[structure.matching.get(name)!]!;
    for (const input of slot.unknowns) {
      if (input === name || !inside.has(input)) continue;
      predecessors.get(name)!.add(input);
      successors.get(input)!.push(name);
    }
  }

  const ready = names.filter((name) => predecessors.get(name)!.size === 0);
  const ordered: string[] = [];
  while (ready.length > 0) {
    const name = ready.pop()!;
    ordered.push(name);
    for (const next of successors.get(name)!) {
      const waiting = predecessors.get(next)!;
      waiting.delete(name);
      if (waiting.size === 0) ready.push(next);
    }
  }
  return ordered.length === names.length ? ordered : undefined;
}

/**
 * Describes what the states were doing when integration stopped. A model that
 * blows up almost always shows it here — a molar flow gone negative, or a
 * derivative many orders of magnitude larger than the values it drives — and
 * that is far more use than the name of the method that gave up.
 */
function describeRunaway(
  states: readonly string[],
  last: { t: number; y: number[] } | undefined,
  derivative: (t: number, y: readonly number[]) => number[],
): { detail?: string } {
  if (last === undefined) return {};
  let slopes: number[];
  try {
    slopes = derivative(last.t, last.y);
  } catch {
    return {};
  }

  const negative = states
    .map((name, index) => ({ name, value: last.y[index]! }))
    .filter((entry) => entry.value < 0);

  let steepest = 0;
  for (let index = 1; index < slopes.length; index += 1) {
    if (Math.abs(slopes[index]!) > Math.abs(slopes[steepest]!)) steepest = index;
  }

  const parts: string[] = [];
  if (negative.length > 0) {
    parts.push(
      negative
        .map((entry) => `${entry.name}=${entry.value.toPrecision(4)}`)
        .join(", "),
    );
  }
  const slope = slopes[steepest];
  if (slope !== undefined && Number.isFinite(slope) && Math.abs(slope) > 0) {
    parts.push(`d(${states[steepest]})=${slope.toExponential(2)}`);
  }
  return parts.length > 0 ? { detail: parts.join("; ") } : {};
}
