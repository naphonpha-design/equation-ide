import type { Span } from "./tokens";

export interface NameRef {
  name: string;
  span: Span;
}

export type Expression =
  | NumberLiteral
  | VariableRef
  | UnaryExpression
  | BinaryExpression
  | CallExpression;

export interface NumberLiteral {
  kind: "number";
  value: number;
  span: Span;
}

export interface VariableRef {
  kind: "variable";
  name: string;
  span: Span;
}

export interface UnaryExpression {
  kind: "unary";
  operator: "+" | "-";
  operand: Expression;
  span: Span;
}

export interface BinaryExpression {
  kind: "binary";
  operator: "+" | "-" | "*" | "/" | "^";
  left: Expression;
  right: Expression;
  span: Span;
}

export interface CallExpression {
  kind: "call";
  callee: NameRef;
  args: Expression[];
  span: Span;
}

/** `label: left = right`, or plain `left = right`. */
export interface EquationStatement {
  kind: "equation";
  label?: NameRef;
  left: Expression;
  right: Expression;
  span: Span;
}

/** `FA' = expr` — the rate of change of `FA` along the independent variable. */
export interface DerivativeStatement {
  kind: "derivative";
  target: NameRef;
  expression: Expression;
  span: Span;
}

/** `FA # FA0` — an initial condition for a state, or a starting guess for an
 *  iteration variable. */
export interface InitialStatement {
  kind: "initial";
  target: NameRef;
  expression: Expression;
  span: Span;
}

/** `RESET T # 150 [40,400] BY ebal` */
export interface ResetStatement {
  kind: "reset";
  target: NameRef;
  guess: Expression;
  lower: Expression;
  upper: Expression;
  by: NameRef;
  span: Span;
}

/** `INTEGRAL W[0,50] step 0.1 by RKV` */
export interface IntegralStatement {
  kind: "integral";
  variable: NameRef;
  lower: Expression;
  upper: Expression;
  step?: Expression;
  method?: NameRef;
  span: Span;
}

/** `trend z,CA,CB step 1` */
export interface TrendStatement {
  kind: "trend";
  names: NameRef[];
  step?: Expression;
  span: Span;
}

/** `OUTPUT T,XA,SCA` */
export interface OutputStatement {
  kind: "output";
  names: NameRef[];
  span: Span;
}

export type Statement =
  | EquationStatement
  | DerivativeStatement
  | InitialStatement
  | ResetStatement
  | IntegralStatement
  | TrendStatement
  | OutputStatement;

export interface Program {
  statements: Statement[];
}

/** Calls `visit` on every node of an expression tree, parents before children. */
export function walkExpression(
  expression: Expression,
  visit: (node: Expression) => void,
): void {
  visit(expression);
  switch (expression.kind) {
    case "unary":
      walkExpression(expression.operand, visit);
      break;
    case "binary":
      walkExpression(expression.left, visit);
      walkExpression(expression.right, visit);
      break;
    case "call":
      for (const argument of expression.args) walkExpression(argument, visit);
      break;
    default:
      break;
  }
}

/** Every expression that appears directly in a statement. */
export function statementExpressions(statement: Statement): Expression[] {
  switch (statement.kind) {
    case "equation":
      return [statement.left, statement.right];
    case "derivative":
    case "initial":
      return [statement.expression];
    case "reset":
      return [statement.guess, statement.lower, statement.upper];
    case "integral":
      return statement.step
        ? [statement.lower, statement.upper, statement.step]
        : [statement.lower, statement.upper];
    case "trend":
      return statement.step ? [statement.step] : [];
    case "output":
      return [];
  }
}
