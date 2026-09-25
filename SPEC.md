# EQUATRAN Web IDE — Specification

Agreed scope, locked 2026-09-26.

## Problem

Real EQUATRAN-G reports syntax errors without saying *where* or *why*.
Users edit `.eqs` files blind. This web IDE fixes that first, and runs the
model second.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Language | EQUATRAN-G, `.eqs` files |
| 2 | Execution | Own solver in TypeScript, runs in the browser |
| 3 | Grammar source | Two real sample models in `samples/` |
| 5 | Validation depth | L1 lexical, L2 syntax, L3 semantic, L4 structural. No unit checking (L5) |
| 6 | Problem classes | Nonlinear algebraic **and** ODE/DAE |
| 8 | Deployment | Static SPA, no backend, no login, localStorage |
| 9 | Editor | Monaco |
| 10 | Results | Tabs: Output / Trend / Chart / Problems, plus raw console view, CSV export |
| 11 | UI language | Thai and English, switchable |
| 12 | Encoding | Detect on open, choose UTF-8 or TIS-620 on save |
| 13 | Strictness | Errors (certain) vs warnings (suspicious), both with line, reason, and fix |
| 14 | Correctness | Residual and balance checks now; golden tests against real EQUATRAN output when available |
| 15 | v1 features | Syntax colouring, sample templates, file bar, Ctrl+Enter, themes, variable map panel |
| 16 | Delivery | Four milestones, each independently usable |

## Grammar (derived from samples)

```
program     := statement*
statement   := label? equation
             | derivative
             | initial
             | reset
             | integral
             | trend
             | output
label       := IDENT ':'
equation    := expr '=' expr
derivative  := IDENT "'" '=' expr          // d(IDENT)/d(independent var)
initial     := IDENT '#' expr              // initial condition or iteration guess
reset       := 'RESET' IDENT '#' expr '[' expr ',' expr ']' 'BY' IDENT
integral    := 'INTEGRAL' IDENT '[' expr ',' expr ']' 'step' expr 'by' IDENT
trend       := 'trend' identList 'step' expr
output      := 'OUTPUT' identList
```

- Statements are separated by newline or `;`.
- Comments run from `//` to end of line.
- Keywords are case-insensitive; identifiers are case-sensitive.
- Operators: `+ - * / ^`, parentheses, unary minus.
- Numbers: integer, decimal, scientific (`5.00E-3`, `1E-12`).
- Declaration order does not matter — the program is a system of equations,
  not a sequence of commands.

## Execution semantics

1. Build a dependency graph over all equations.
2. Classify variables: independent (from `INTEGRAL`), state (has `'`),
   algebraic (everything else).
3. Find cycles. Tear them at variables carrying `#`.
4. Solve torn algebraic systems with Newton-Raphson, respecting `RESET` bounds.
5. If an `INTEGRAL` statement is present, integrate states over the independent
   variable, solving the algebraic subsystem at every step (a DAE, not a plain ODE).
6. Record `trend` variables at the requested interval; report `OUTPUT` variables
   at the end.

## Milestones

- **M1** — Lexer, parser, AST, validation L1–L3, Monaco highlighting, inline
  markers, Problems panel. *Done.*
- **M2** — Validation L4: equation-to-unknown matching, balance, circular
  groups, variable map panel. *Done.*
- **M3** — Algebraic solver. `samples/lec6-cstr.eqs` runs. Output tab, console,
  residuals. *Done.*
- **M4** — DAE integrator, `INTEGRAL` and `trend`.
  `samples/fixed-bed-isothermal.eqs` runs. Trend and Chart tabs, CSV export.

Carried through every milestone: localStorage file bar, sample templates,
Ctrl+Enter to run, light and dark themes, TH/EN toggle, TIS-620 support, tests.
