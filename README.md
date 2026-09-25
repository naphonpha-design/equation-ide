# EQUATRAN Web IDE

A browser IDE for EQUATRAN `.eqs` models. It exists because real EQUATRAN-G
reports a syntax error without saying where it is or what to do about it.

Everything runs in the browser. There is no server and no login.

## Status — milestone M3

| | |
|---|---|
| ✅ | Lexer, parser and AST for the EQUATRAN dialect in `samples/` |
| ✅ | Validation L1 lexical, L2 syntax, L3 semantic — errors and warnings, each with a location, a reason and a suggested fix |
| ✅ | Monaco editor with EQUATRAN syntax colouring, inline squiggles and a Problems panel that jumps to the line |
| ✅ | File list in localStorage, sample models, open and save with UTF-8 or TIS-620, Thai and English messages, light and dark themes |
| ✅ | Validation L4 structural — bipartite matching of equations to unknowns, so a missing or surplus equation is named rather than counted; states without an initial value; circular groups with nothing to break them |
| ✅ | Variable map panel: equation and unknown balance, each variable's kind, where it is defined, whether it carries a guess, and how often it is used |
| ✅ | Algebraic solver: block decomposition, tearing at `#` guesses, damped Newton with `RESET` bounds. `samples/lec6-cstr.eqs` runs to a largest residual of 4e-12 |
| ✅ | Results tab with the `OUTPUT` table, a raw text view, and the residual as a trustworthiness signal |
| ⏳ | M4 — DAE integrator for `INTEGRAL` and `trend`, so `samples/fixed-bed-isothermal.eqs` runs, with charts and CSV export |

Run solves algebraic models. A model with `INTEGRAL` says plainly that
integration arrives in M4 rather than failing obscurely.

## Running it

```sh
npm install
npm run dev        # development server
npm test           # 89 tests
npm run build      # static site in dist/
```

`dist/` is a plain static bundle; any static host will serve it. Monaco is
bundled rather than loaded from a CDN, so the IDE works offline. It is large,
so it loads after first paint.

## Layout

```
src/lang/        lexer, parser, AST, semantic and structural analysis, Monaco language
src/i18n/        Thai and English text for diagnostics and the interface
src/encoding/    TIS-620 detection and conversion
src/storage/     localStorage workspace
src/solver/      expression evaluation, Newton-Raphson, block solving
src/ui/          React components
samples/         the two reference models this dialect was derived from
tests/           unit tests, plus a guard that both samples stay error-free
```

`SPEC.md` records the decisions behind all of this, including the grammar.

## Notes on the dialect

The grammar was derived from two working models rather than from a vendor
manual. Where the two disagree with real EQUATRAN-G, the samples win and the
parser is wrong — add the case to `tests/` and fix it.

Statements are equations, not commands: order does not matter, `#` gives an
iteration guess or an initial condition, `'` marks a derivative, and keywords
are case-insensitive while variable names are not.
