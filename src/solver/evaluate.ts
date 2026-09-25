import type { Expression } from "../lang/ast";

/** Thrown when an expression cannot produce a number. */
export class EvaluationError extends Error {
  constructor(
    message: string,
    readonly variable?: string,
  ) {
    super(message);
    this.name = "EvaluationError";
  }
}

type Fn = (args: number[]) => number;

const FUNCTIONS: Readonly<Record<string, Fn>> = {
  EXP: ([x]) => Math.exp(x!),
  LN: ([x]) => Math.log(x!),
  LOG: ([x]) => Math.log(x!),
  LOG10: ([x]) => Math.log10(x!),
  SQRT: ([x]) => Math.sqrt(x!),
  ABS: ([x]) => Math.abs(x!),
  SIN: ([x]) => Math.sin(x!),
  COS: ([x]) => Math.cos(x!),
  TAN: ([x]) => Math.tan(x!),
  ASIN: ([x]) => Math.asin(x!),
  ACOS: ([x]) => Math.acos(x!),
  ATAN: ([x]) => Math.atan(x!),
  SINH: ([x]) => Math.sinh(x!),
  COSH: ([x]) => Math.cosh(x!),
  TANH: ([x]) => Math.tanh(x!),
  INT: ([x]) => Math.trunc(x!),
  SIGN: ([x]) => Math.sign(x!),
  MAX: ([a, b]) => Math.max(a!, b!),
  MIN: ([a, b]) => Math.min(a!, b!),
  MOD: ([a, b]) => a! % b!,
  ATAN2: ([a, b]) => Math.atan2(a!, b!),
};

/**
 * Evaluates an expression against the values known so far.
 *
 * `^` uses the identity `exp(b * ln(a))` only where it must: a negative base
 * with an integer exponent stays exact, which matters because rate laws such
 * as `CA^2` are written with plain integer powers.
 */
export function evaluate(
  expression: Expression,
  environment: ReadonlyMap<string, number>,
): number {
  switch (expression.kind) {
    case "number":
      return expression.value;

    case "variable": {
      const value = environment.get(expression.name);
      if (value === undefined) {
        throw new EvaluationError(
          `no value for ${expression.name}`,
          expression.name,
        );
      }
      return value;
    }

    case "unary": {
      const operand = evaluate(expression.operand, environment);
      return expression.operator === "-" ? -operand : operand;
    }

    case "binary": {
      const left = evaluate(expression.left, environment);
      const right = evaluate(expression.right, environment);
      switch (expression.operator) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return left / right;
        case "^":
          return Math.pow(left, right);
      }
      break;
    }

    case "call": {
      const fn = FUNCTIONS[expression.callee.name.toUpperCase()];
      if (fn === undefined) {
        throw new EvaluationError(`unknown function ${expression.callee.name}`);
      }
      return fn(expression.args.map((arg) => evaluate(arg, environment)));
    }
  }
  throw new EvaluationError("cannot evaluate expression");
}
