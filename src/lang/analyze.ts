import type {
  Expression,
  NameRef,
  Program,
  Statement,
} from "./ast";
import { statementExpressions, walkExpression } from "./ast";
import type { Diagnostic } from "./diagnostics";
import { bySourceOrder, diagnostic, suggestName } from "./diagnostics";
import { BUILTIN_FUNCTIONS } from "./tokens";
import type { Span } from "./tokens";

export type VariableRole =
  | "independent" // the variable an INTEGRAL runs over
  | "state" // has a derivative equation
  | "algebraic" // determined by an equation
  | "unknown"; // referenced, but nothing determines it

export interface VariableInfo {
  name: string;
  role: VariableRole;
  /** Equations that assign this variable directly, as `name = ...`. */
  definitions: Span[];
  /** Implicit equations the variable takes part in. Any one of them could be
   *  the equation that determines it, so they count towards being determined
   *  but never towards being defined twice. */
  implicitEquations: Span[];
  /** Places the variable is read. */
  references: Span[];
  /** Spans of `#` statements giving it an initial value or starting guess. */
  initials: Span[];
  hasReset: boolean;
}

export interface ModelSymbols {
  variables: Map<string, VariableInfo>;
  labels: Map<string, Span>;
  integral?: { variable: string; span: Span };
  outputs: NameRef[];
  trends: NameRef[];
}

export interface AnalysisResult {
  symbols: ModelSymbols;
  diagnostics: Diagnostic[];
}

/** True when an equation's left side is a bare name, so the equation plainly
 *  assigns that name. Anything else is an implicit equation that the solver
 *  has to rearrange. */
function assignedName(statement: Statement): NameRef | undefined {
  if (statement.kind !== "equation") return undefined;
  if (statement.left.kind !== "variable") return undefined;
  return { name: statement.left.name, span: statement.left.span };
}

export function analyze(program: Program): AnalysisResult {
  const diagnostics: Diagnostic[] = [];
  const variables = new Map<string, VariableInfo>();
  const labels = new Map<string, Span>();
  const outputs: NameRef[] = [];
  const trends: NameRef[] = [];
  let integral: ModelSymbols["integral"];

  const touch = (name: string): VariableInfo => {
    let info = variables.get(name);
    if (info === undefined) {
      info = {
        name,
        role: "unknown",
        definitions: [],
        implicitEquations: [],
        references: [],
        initials: [],
        hasReset: false,
      };
      variables.set(name, info);
    }
    return info;
  };

  const define = (ref: NameRef, role: VariableRole): void => {
    const info = touch(ref.name);
    info.definitions.push(ref.span);
    // `state` and `independent` are stronger claims than `algebraic`.
    if (info.role === "unknown" || role !== "algebraic") info.role = role;
  };

  const readExpression = (expression: Expression): void => {
    walkExpression(expression, (node) => {
      if (node.kind === "variable") {
        touch(node.name).references.push(node.span);
        return;
      }
      if (node.kind === "call") {
        const arity = BUILTIN_FUNCTIONS[node.callee.name.toUpperCase()];
        if (arity === undefined) {
          const suggestion = suggestName(
            node.callee.name.toUpperCase(),
            Object.keys(BUILTIN_FUNCTIONS),
          );
          diagnostics.push(
            diagnostic("error", "E201", node.callee.span, {
              name: node.callee.name,
              ...(suggestion ? { suggestion } : {}),
            }),
          );
          return;
        }
        if (node.args.length !== arity) {
          diagnostics.push(
            diagnostic("error", "E202", node.span, {
              name: node.callee.name.toUpperCase(),
              expected: arity,
              actual: node.args.length,
            }),
          );
        }
      }
    });
  };

  // Pass 1 — collect definitions, labels and declarations.
  for (const statement of program.statements) {
    if (statement.kind === "equation") {
      if (statement.label) {
        const existing = labels.get(statement.label.name);
        if (existing) {
          diagnostics.push(
            diagnostic("error", "E204", statement.label.span, {
              name: statement.label.name,
              line: existing.start.line,
            }),
          );
        } else {
          labels.set(statement.label.name, statement.label.span);
        }
      }
      const assigned = assignedName(statement);
      if (assigned) {
        define(assigned, "algebraic");
      } else {
        // Implicit equation: any name in it could be the one it determines.
        for (const side of [statement.left, statement.right]) {
          walkExpression(side, (node) => {
            if (node.kind !== "variable") return;
            const info = touch(node.name);
            info.implicitEquations.push(node.span);
            if (info.role === "unknown") info.role = "algebraic";
          });
        }
      }
      continue;
    }

    if (statement.kind === "derivative") {
      define(statement.target, "state");
      continue;
    }

    if (statement.kind === "initial") {
      touch(statement.target.name).initials.push(statement.target.span);
      continue;
    }

    if (statement.kind === "reset") {
      const info = touch(statement.target.name);
      info.hasReset = true;
      info.initials.push(statement.target.span);
      continue;
    }

    if (statement.kind === "integral") {
      if (integral !== undefined) {
        diagnostics.push(
          diagnostic("error", "E209", statement.span, {
            line: integral.span.start.line,
          }),
        );
      } else {
        integral = { variable: statement.variable.name, span: statement.span };
        define(statement.variable, "independent");
      }
      continue;
    }

    if (statement.kind === "trend") trends.push(...statement.names);
    if (statement.kind === "output") outputs.push(...statement.names);
  }

  // Pass 2 — collect references.
  for (const statement of program.statements) {
    const assigned = assignedName(statement);
    for (const expression of statementExpressions(statement)) {
      // For a plain assignment the left side is the definition, not a read.
      if (assigned && expression === (statement as { left?: Expression }).left) {
        continue;
      }
      readExpression(expression);
    }
    if (statement.kind === "reset") {
      touch(statement.target.name).references.push(statement.target.span);
    }
  }
  for (const ref of [...outputs, ...trends]) {
    touch(ref.name).references.push(ref.span);
  }

  const symbols: ModelSymbols = {
    variables,
    labels,
    outputs,
    trends,
    ...(integral ? { integral } : {}),
  };

  diagnostics.push(...checkSemantics(program, symbols));
  diagnostics.sort(bySourceOrder);
  return { symbols, diagnostics };
}

/** Whether some equation in the model could give this variable a value. */
function isDetermined(info: VariableInfo): boolean {
  return info.definitions.length > 0 || info.implicitEquations.length > 0;
}

function checkSemantics(
  program: Program,
  symbols: ModelSymbols,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const known = [...symbols.variables.keys()];

  for (const info of symbols.variables.values()) {
    // Referenced but nothing determines it.
    if (!isDetermined(info) && info.references.length > 0) {
      const first = info.references[0]!;
      const suggestion = suggestName(
        info.name,
        known.filter((name) => isDetermined(symbols.variables.get(name)!)),
      );
      diagnostics.push(
        diagnostic("error", "E200", first, {
          name: info.name,
          ...(suggestion ? { suggestion } : {}),
        }),
      );
      continue;
    }

    // Assigned directly more than once.
    if (info.definitions.length > 1) {
      const [first, ...rest] = info.definitions;
      for (const span of rest) {
        diagnostics.push(
          diagnostic("warning", "E205", span, {
            name: info.name,
            line: first!.start.line,
          }),
        );
      }
    }

    // Determined but nothing reads it.
    if (
      isDetermined(info) &&
      info.references.length === 0 &&
      info.role !== "independent"
    ) {
      diagnostics.push(
        diagnostic("warning", "E206", (info.definitions[0] ?? info.implicitEquations[0])!, {
        name: info.name,
      }),
      );
    }

    // `#` given for a name no equation mentions.
    if (info.initials.length > 0 && !isDetermined(info)) {
      diagnostics.push(
        diagnostic("warning", "E210", info.initials[0]!, { name: info.name }),
      );
    }
  }

  let hasDerivative = false;
  for (const statement of program.statements) {
    if (statement.kind === "derivative") hasDerivative = true;

    if (statement.kind === "reset") {
      if (!symbols.labels.has(statement.by.name)) {
        const suggestion = suggestName(statement.by.name, symbols.labels.keys());
        diagnostics.push(
          diagnostic("error", "E203", statement.by.span, {
            name: statement.by.name,
            ...(suggestion ? { suggestion } : {}),
          }),
        );
      }
    }

    // A plain assignment whose right side reads the name it defines.
    if (statement.kind === "equation" && statement.left.kind === "variable") {
      const target = statement.left.name;
      let selfReferential = false;
      walkExpression(statement.right, (node) => {
        if (node.kind === "variable" && node.name === target) {
          selfReferential = true;
        }
      });
      if (selfReferential) {
        diagnostics.push(
          diagnostic("warning", "E211", statement.span, { name: target }),
        );
      }
    }
  }

  if (hasDerivative && symbols.integral === undefined) {
    const first = program.statements.find((s) => s.kind === "derivative");
    if (first) {
      diagnostics.push(diagnostic("error", "E208", first.span, {}));
    }
  }

  for (const ref of [...symbols.outputs, ...symbols.trends]) {
    const info = symbols.variables.get(ref.name);
    if (info === undefined || !isDetermined(info)) {
      // Already reported as E200 when it is referenced elsewhere too.
      if (info && info.references.length > 1) continue;
      const suggestion = suggestName(ref.name, symbols.variables.keys());
      diagnostics.push(
        diagnostic("error", "E207", ref.span, {
          name: ref.name,
          ...(suggestion ? { suggestion } : {}),
        }),
      );
    }
  }

  return diagnostics;
}
