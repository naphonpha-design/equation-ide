import type { Expression, Program } from "../lang/ast";
import type { ModelStructure, ModelSymbols } from "../lang";
import { condense } from "../lang/structure";
import { EvaluationError, evaluate } from "./evaluate";
import { solveNewton } from "./newton";

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

export type SolveFailure =
  | { kind: "unsupported-ode" }
  | { kind: "unbalanced" }
  | { kind: "block-failed"; variables: string[]; reason: string }
  | { kind: "evaluation"; message: string; variable?: string };

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
}

interface Guess {
  value?: Expression;
  lower?: Expression;
  upper?: Expression;
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

/**
 * Solves the algebraic system a model describes.
 *
 * The work is split into blocks first: variables that depend on each other in
 * a circle are solved together by Newton, and everything else is evaluated in
 * dependency order. That is what makes a model of this size converge from the
 * rough guesses a `#` line provides — solving all 56 unknowns at once from
 * the same guesses would not.
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

  if (structure.states.length > 0 || structure.independent !== undefined) {
    return fail({ kind: "unsupported-ode" });
  }
  if (
    structure.unmatchedUnknowns.length > 0 ||
    structure.unmatchedEquations.length > 0
  ) {
    return fail({ kind: "unbalanced" });
  }

  const guesses = collectGuesses(program);
  const { components } = condense(
    structure.unknowns,
    structure.equations,
    structure.matching,
  );

  // `structure.equations` is collected in statement order, so the equation
  // statements line up one for one. Resolved once: Newton asks for residuals
  // thousands of times.
  const equationStatements = program.statements.filter(
    (statement) => statement.kind === "equation",
  );

  const residualOf = (equationIndex: number): number => {
    const statement = equationStatements[equationIndex]!;
    return evaluate(statement.left, values) - evaluate(statement.right, values);
  };

  try {
    for (const component of components) {
      const equationIndices = component.map(
        (name) => structure.matching.get(name)!,
      );

      // A lone variable that its own equation assigns directly needs no
      // iteration: evaluate the right-hand side and move on.
      if (component.length === 1) {
        const name = component[0]!;
        const slot = structure.equations[equationIndices[0]!]!;
        const statement = equationStatements[equationIndices[0]!]!;
        const selfReferential = slot.unknowns.includes(name)
          ? mentions(statement.right, name) || statement.left.kind !== "variable"
          : false;
        if (slot.preferred === name && !selfReferential) {
          values.set(name, evaluate(statement.right, values));
          blocks.push({
            variables: [name],
            direct: true,
            iterations: 0,
            residual: 0,
            converged: true,
          });
          continue;
        }
      }

      // Otherwise the block is circular. Tear it at the variables carrying a
      // `#` guess, exactly as the model author intended: iterate on those
      // alone and evaluate the rest forward from them. Iterating on all
      // sixteen variables of a reactor loop at once does not converge from
      // guesses meant for three of them.
      const torn = component.filter((name) => guesses.get(name)?.value !== undefined);
      const rest = component.filter((name) => !torn.includes(name));
      const substitution = rest.every((name) => {
        const slot = structure.equations[structure.matching.get(name)!]!;
        const statement = equationStatements[structure.matching.get(name)!]!;
        return slot.preferred === name && !mentions(statement.right, name);
      });
      const ordered = substitution ? orderForSubstitution(rest, structure) : undefined;

      const iterated = torn.length > 0 && ordered !== undefined ? torn : component;
      const residualEquations = iterated.map(
        (name) => structure.matching.get(name)!,
      );

      const start = iterated.map((name) => {
        const guess = guesses.get(name)?.value;
        if (guess === undefined) return 1;
        try {
          return evaluate(guess, values);
        } catch {
          return 1;
        }
      });
      const lower = iterated.map((name) =>
        evaluateBound(guesses.get(name)?.lower, values),
      );
      const upper = iterated.map((name) =>
        evaluateBound(guesses.get(name)?.upper, values),
      );

      const blockResidual = (x: readonly number[]): number[] => {
        iterated.forEach((name, index) => values.set(name, x[index]!));
        if (ordered !== undefined) {
          for (const name of ordered) {
            const statement = equationStatements[structure.matching.get(name)!]!;
            values.set(name, evaluate(statement.right, values));
          }
        }
        return residualEquations.map(residualOf);
      };

      // Fix the row scaling at the starting point so the comparison between
      // iterations stays meaningful.
      const scale = blockResidual(start).map((value) =>
        Number.isFinite(value) ? Math.max(1, Math.abs(value)) : 1,
      );

      const result = solveNewton(blockResidual, start, {
        tolerance,
        maxIterations,
        lower,
        upper,
        scale,
      });

      iterated.forEach((name, index) => values.set(name, result.x[index]!));
      if (ordered !== undefined) {
        for (const name of ordered) {
          const statement = equationStatements[structure.matching.get(name)!]!;
          values.set(name, evaluate(statement.right, values));
        }
      }
      blocks.push({
        variables: component,
        direct: false,
        iterations: result.iterations,
        residual: result.residual,
        converged: result.converged,
        ...(result.reason ? { reason: result.reason } : {}),
      });
      log.push(
        `${component.length} variables, torn at ${iterated.join(", ")}: ` +
          `${result.iterations} iterations, residual ${result.residual.toExponential(3)}`,
      );

      if (!result.converged) {
        return fail({
          kind: "block-failed",
          variables: component,
          reason: result.reason ?? "iterations",
        });
      }
    }
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

  let maxResidual = 0;
  for (let index = 0; index < structure.equations.length; index += 1) {
    const value = Math.abs(residualOf(index));
    if (value > maxResidual) maxResidual = value;
  }

  const outputs = symbols.outputs.map((ref) => ({
    name: ref.name,
    value: values.get(ref.name) ?? Number.NaN,
  }));

  return { values, outputs, blocks, converged: true, maxResidual, log };
}

function evaluateBound(
  expression: Expression | undefined,
  values: ReadonlyMap<string, number>,
): number | undefined {
  if (expression === undefined) return undefined;
  try {
    return evaluate(expression, values);
  } catch {
    return undefined;
  }
}

function mentions(expression: Expression, name: string): boolean {
  switch (expression.kind) {
    case "variable":
      return expression.name === name;
    case "unary":
      return mentions(expression.operand, name);
    case "binary":
      return mentions(expression.left, name) || mentions(expression.right, name);
    case "call":
      return expression.args.some((argument) => mentions(argument, name));
    default:
      return false;
  }
}

/**
 * Orders the variables of a torn block so each one can be evaluated from
 * values already known. Kahn's algorithm over the edges the matching implies,
 * counting only edges between members of `names` — everything else is either
 * already solved or one of the tear variables.
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
