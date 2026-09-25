# EQUATRAN Web IDE

A browser IDE for EQUATRAN `.eqs` models. It exists because real EQUATRAN-G
reports a syntax error without saying where it is or what to do about it.

Everything runs in the browser. There is no server and no login.

## Status — milestone M1

| | |
|---|---|
| ✅ | Lexer, parser and AST for the EQUATRAN dialect in `samples/` |
| ✅ | Validation L1 lexical, L2 syntax, L3 semantic — errors and warnings, each with a location, a reason and a suggested fix |
| ✅ | Monaco editor with EQUATRAN syntax colouring, inline squiggles and a Problems panel that jumps to the line |
| ✅ | File list in localStorage, sample models, open and save with UTF-8 or TIS-620, Thai and English messages, light and dark themes |
| ⏳ | M2 — structural validation (L4): dependency graph, equation and variable balance, variable map panel |
| ⏳ | M3 — algebraic solver, so `samples/lec6-cstr.eqs` runs |
| ⏳ | M4 — DAE integrator for `INTEGRAL` and `trend`, so `samples/fixed-bed-isothermal.eqs` runs, with charts and CSV export |

The Run button is present but reports that solving arrives in M3.

## Running it

```sh
npm install
npm run dev        # development server
npm test           # 52 tests
npm run build      # static site in dist/
```

`dist/` is a plain static bundle; any static host will serve it. Monaco is
bundled rather than loaded from a CDN, so the IDE works offline. It is large,
so it loads after first paint.

## Layout

```
src/lang/        lexer, parser, AST, semantic analysis, Monaco language
src/i18n/        Thai and English text for diagnostics and the interface
src/encoding/    TIS-620 detection and conversion
src/storage/     localStorage workspace
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
