import type { Program, Statement } from "./ast";
import { walkExpression } from "./ast";
import type { ModelSymbols } from "./analyze";
import type { Diagnostic } from "./diagnostics";
import { diagnostic } from "./diagnostics";
import type { Span } from "./tokens";

/** One equation of the algebraic system, and the unknowns it involves.
 *  Derivative equations are excluded: they determine a rate of change, which
 *  the integrator consumes, not an algebraic unknown. */
export interface EquationSlot {
  span: Span;
  label?: string;
  /** Algebraic unknowns this equation mentions. */
  unknowns: string[];
  /** For `x = ...`, the name on the left, which is the natural output. */
  preferred?: string;
}

export interface ModelStructure {
  independent?: string;
  states: string[];
  unknowns: string[];
  equations: EquationSlot[];
  /** Unknown -> the equation index that determines it. */
  matching: Map<string, number>;
  /** Unknowns no equation is left to determine. */
  unmatchedUnknowns: string[];
  /** Equations with no unknown left to determine. */
  unmatchedEquations: number[];
  /** Groups of unknowns that can only be solved together. */
  loops: string[][];
  degreesOfFreedom: number;
}

export interface StructureResult {
  structure: ModelStructure;
  diagnostics: Diagnostic[];
}

function unknownsIn(statement: Statement, isUnknown: (name: string) => boolean): string[] {
  const found = new Set<string>();
  const sides =
    statement.kind === "equation" ? [statement.left, statement.right] : [];
  for (const side of sides) {
    walkExpression(side, (node) => {
      if (node.kind === "variable" && isUnknown(node.name)) found.add(node.name);
    });
  }
  return [...found];
}

/**
 * Works out which equation determines which variable, and reports the
 * structural faults that real EQUATRAN only ever reports as a bare failure:
 * an equation short, an equation too many, a state with no starting value, or
 * a circular group with nothing to break it.
 */
export function analyzeStructure(
  program: Program,
  symbols: ModelSymbols,
): StructureResult {
  const diagnostics: Diagnostic[] = [];

  const independent = symbols.integral?.variable;
  const states = [...symbols.variables.values()]
    .filter((info) => info.role === "state")
    .map((info) => info.name);
  const stateSet = new Set(states);

  const isUnknown = (name: string): boolean =>
    name !== independent && !stateSet.has(name) && symbols.variables.has(name);

  const unknowns = [...symbols.variables.keys()].filter(isUnknown);

  const equations: EquationSlot[] = [];
  for (const statement of program.statements) {
    if (statement.kind !== "equation") continue;
    const slot: EquationSlot = {
      span: statement.span,
      unknowns: unknownsIn(statement, isUnknown),
    };
    if (statement.label) slot.label = statement.label.name;
    if (statement.left.kind === "variable" && isUnknown(statement.left.name)) {
      slot.preferred = statement.left.name;
    }
    equations.push(slot);
  }

  // `RESET x ... BY e` says outright that equation `e` is the one that
  // determines `x`, so honour it before searching for any other assignment.
  const forced = new Map<number, string>();
  for (const statement of program.statements) {
    if (statement.kind !== "reset") continue;
    const index = equations.findIndex((slot) => slot.label === statement.by.name);
    if (index === -1) continue; // already reported as E203
    if (!equations[index]!.unknowns.includes(statement.target.name)) {
      diagnostics.push(
        diagnostic("error", "E304", statement.target.span, {
          name: statement.target.name,
          label: statement.by.name,
        }),
      );
      continue;
    }
    forced.set(index, statement.target.name);
  }

  const { matching, unmatchedUnknowns, unmatchedEquations } = matchEquations(
    unknowns,
    equations,
    forced,
  );

  const degreesOfFreedom = unknowns.length - equations.length;

  if (unmatchedUnknowns.length > 0) {
    // Point at the first place each unknown is mentioned.
    const first = unmatchedUnknowns[0]!;
    const info = symbols.variables.get(first)!;
    const anchor =
      info.definitions[0] ?? info.implicitEquations[0] ?? info.references[0]!;
    diagnostics.push(
      diagnostic("error", "E300", anchor, {
        count: unmatchedUnknowns.length,
        names: unmatchedUnknowns.join(", "),
      }),
    );
  }

  for (const index of unmatchedEquations) {
    diagnostics.push(
      diagnostic("error", "E301", equations[index]!.span, {
        count: unmatchedEquations.length,
      }),
    );
  }

  // Every state needs a starting value before it can be integrated.
  for (const name of states) {
    const info = symbols.variables.get(name)!;
    if (info.initials.length === 0) {
      diagnostics.push(
        diagnostic("error", "E303", info.definitions[0]!, { name }),
      );
    }
  }

  const loops = findLoops(unknowns, equations, matching);
  for (const loop of loops) {
    const torn = loop.some((name) => {
      const info = symbols.variables.get(name)!;
      return info.initials.length > 0 || info.hasReset;
    });
    if (torn) continue;
    const anchor = symbols.variables.get(loop[0]!)!;
    const span =
      anchor.definitions[0] ?? anchor.implicitEquations[0] ?? anchor.references[0]!;
    diagnostics.push(
      diagnostic("warning", "E302", span, {
        names: loop.join(", "),
        first: loop[0]!,
      }),
    );
  }

  return {
    structure: {
      ...(independent ? { independent } : {}),
      states,
      unknowns,
      equations,
      matching,
      unmatchedUnknowns,
      unmatchedEquations,
      loops,
      degreesOfFreedom,
    },
    diagnostics,
  };
}

/**
 * Maximum bipartite matching between unknowns and equations, by augmenting
 * paths. Each equation can determine at most one unknown, and each unknown is
 * determined by at most one equation; what is left over is exactly what is
 * missing or surplus.
 */
function matchEquations(
  unknowns: readonly string[],
  equations: readonly EquationSlot[],
  forced: ReadonlyMap<number, string>,
): {
  matching: Map<string, number>;
  unmatchedUnknowns: string[];
  unmatchedEquations: number[];
} {
  const equationOf = new Map<string, number>();
  const unknownOf = new Map<number, string>();

  for (const [index, name] of forced) {
    equationOf.set(name, index);
    unknownOf.set(index, name);
  }

  // Try each equation's own left-hand side first: it keeps the matching close
  // to how the model is written, so the diagnosis names what a reader expects.
  const order = [...equations.keys()].sort((a, b) => {
    const aPreferred = equations[a]!.preferred === undefined ? 1 : 0;
    const bPreferred = equations[b]!.preferred === undefined ? 1 : 0;
    return aPreferred - bPreferred;
  });

  const augment = (index: number, seen: Set<string>): boolean => {
    const slot = equations[index]!;
    const candidates = slot.preferred
      ? [slot.preferred, ...slot.unknowns.filter((n) => n !== slot.preferred)]
      : slot.unknowns;
    for (const name of candidates) {
      if (seen.has(name)) continue;
      seen.add(name);
      const holder = equationOf.get(name);
      if (holder === undefined || (!forced.has(holder) && augment(holder, seen))) {
        equationOf.set(name, index);
        unknownOf.set(index, name);
        return true;
      }
    }
    return false;
  };

  for (const index of order) {
    if (unknownOf.has(index)) continue;
    augment(index, new Set());
  }

  return {
    matching: equationOf,
    unmatchedUnknowns: unknowns.filter((name) => !equationOf.has(name)),
    unmatchedEquations: [...equations.keys()].filter(
      (index) => !unknownOf.has(index),
    ),
  };
}

/**
 * Condenses the dependency graph implied by the matching into strongly
 * connected components, returned in the order they must be solved: a
 * component appears after everything it needs.
 *
 * Tarjan's algorithm, written iteratively so a deep model cannot overflow the
 * stack. Tarjan emits components in reverse topological order, so the result
 * is reversed before being returned.
 */
export function condense(
  unknowns: readonly string[],
  equations: readonly EquationSlot[],
  matching: ReadonlyMap<string, number>,
): { components: string[][]; isLoop: boolean[] } {
  const successors = new Map<string, string[]>();
  for (const name of unknowns) successors.set(name, []);
  for (const [name, index] of matching) {
    for (const input of equations[index]!.unknowns) {
      if (input === name) continue;
      successors.get(input)?.push(name);
    }
  }

  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  const isLoop: boolean[] = [];
  let counter = 0;

  for (const root of unknowns) {
    if (index.has(root)) continue;
    const work: { node: string; next: number }[] = [{ node: root, next: 0 }];
    index.set(root, counter);
    low.set(root, counter);
    counter += 1;
    stack.push(root);
    onStack.add(root);

    while (work.length > 0) {
      const frame = work[work.length - 1]!;
      const children = successors.get(frame.node) ?? [];
      if (frame.next < children.length) {
        const child = children[frame.next]!;
        frame.next += 1;
        if (!index.has(child)) {
          index.set(child, counter);
          low.set(child, counter);
          counter += 1;
          stack.push(child);
          onStack.add(child);
          work.push({ node: child, next: 0 });
        } else if (onStack.has(child)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, index.get(child)!));
        }
        continue;
      }

      work.pop();
      const parent = work[work.length - 1];
      if (parent) {
        low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!));
      }
      if (low.get(frame.node) === index.get(frame.node)) {
        const component: string[] = [];
        for (;;) {
          const member = stack.pop()!;
          onStack.delete(member);
          component.push(member);
          if (member === frame.node) break;
        }
        component.reverse();
        const selfLoop =
          component.length === 1 &&
          (successors.get(component[0]!) ?? []).includes(component[0]!);
        components.push(component);
        isLoop.push(component.length > 1 || selfLoop);
      }
    }
  }

  components.reverse();
  isLoop.reverse();
  return { components, isLoop };
}

/** The circular groups among the components: those a solver must handle
 *  together rather than one variable at a time. */
function findLoops(
  unknowns: readonly string[],
  equations: readonly EquationSlot[],
  matching: ReadonlyMap<string, number>,
): string[][] {
  const { components, isLoop } = condense(unknowns, equations, matching);
  return components.filter((_, index) => isLoop[index]);
}
