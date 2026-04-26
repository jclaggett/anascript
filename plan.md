# The Plan

Goal: build a small Lisp with a well defined grammar. The language should be
compiled into javascript. It is a purely evaluative language with no side
effects from user programs: bindings update only by replacing `env` with a new
immutable map (`env.set` / `label`), not by mutating values in place.

Future Goal: to promote the use of reactive transducer framework in languages
like javascript and clojure. Be able to write all programs using rxf for
personal and professional success.

## Next Steps

- Keep `eval.js` as semantic oracle while we run a controlled emitted-runtime cutover.
- Start Cutover Phase A: add an opt-in emitted execution mode in the runtime entry path.
- Add parity sampling in that mode (debug path to compare emitted/interpreter values on the same input when enabled).
- Expand benchmark workloads to include function-valued returns and heavier nested destructuring programs.
- Decide whether to preserve `bind`/`binds` as runtime protocol or replace them with a cleaner explicit contribution representation.

## Current State

- Runtime execution path:
  - `repl.js` -> `makeEnv().eval(...)` -> `eval.js` interpreter (`applyExp` / special forms).
- Reader pipeline (text → values `eval` / `emit` consume):
  - `read.js`: `parse` (text → grammar AST), `transform`, and a small private walk from the transformed tree into host structures (`read` / `form` compose these).
  - `transform.js`: AST → AST (syntax forms, `expand` on symbols, etc.).
  - Public surface: `index.js` exports `read`, `parse`, `transform` (and print / emit APIs); `package.json` `exports` maps `"."` to `src/index.js` only.
- Emitter path:
  - `emit.js` exists and is tested, but is not yet used for runtime execution.
  - Implemented so far: literals, symbols, calls, `label` (including chained left-to-right binding and list/set destructuring with spread), `fn` (definition-time env capture, nested closures, destructuring arg signatures), `do`, `expand`, `if`, `quote`, list/set literals (including `spread` in literals).
  - Recent parity fixes:
    - call-site `label` values emit contribution forms (`bind`/`binds`) in emitted call contexts
    - emitted call ABI now matches interpreter positional-call + spread flatten behavior
    - function arg normalization uses `lang.conj(lang.makeList(), ...args)` so labeled/destructured args match interpreter semantics
    - collection literal elements/spreads now use the same contribution semantics as call args
- Language semantics to preserve:
  - Functions close over environment at definition time (no late rebinding from outer eval state).
  - Labels behave like flattened sequential `let*` bindings.
  - Milestone 3 semantic change (implemented): chained `label` bindings are emitted left-to-right.
  - Negative sets represented with `{~ ...}` conventions already established.

## Architecture Direction

End-to-end pipeline (mental model):

`anascript` → **`read`** → AST → **`transform`** → AST → **`emit`** → JavaScript → **`run`**

How this maps in the repo today:

- **`read`** — In `read.js`, the full reader path: `parse` (text → grammar AST), then `transform`, then a private walk in the same file that turns the transformed tree into the structures `eval` and `emit.js` use. The exported `read()` / `form()` helpers are that full chain; `parse` alone stops at the grammar AST.
- **`transform`** — `transform.js`, AST → AST.
- **`emit`** — `emit.js`, same structures as `read()` produces → JavaScript source string.
- **`run`** — execution: today the interpreter (`eval.js`); later, evaluate emitted JS in a controlled closure (`lang`, `env`).

Design rule: `eval.js` remains the behavior oracle until parity tests show the emitted path is equivalent for supported forms.

## Emit.js Milestones

### Milestone 1 (done)

- Add initial emitter module and tests.
- Add AST-first API (`emitAstExpr`, `emitAstResult`) and keep source wrappers.
- Support basic forms:
  - literals
  - symbols
  - calls
  - `label` with non-destructuring lhs (symbol/string/number)
  - `do`
  - simple `fn`
  - `expand`

### Reader layout (done)

- Transform logic lives in `transform.js` (single-pass rule-dispatched walk); behavior preserved from the earlier `read.js` extraction.
- `read.js` holds parsing (`parse`), re-export of `transform`, the private grammar-tree walk that finishes the reader, and legacy `read` / `form` composition.
- Legacy JS emission was removed from the reader; all JS string emission for execution belongs in `emit.js`.

### Milestone 2 (done in `emit.js`)

- `if` — short-circuit ternary in emitted JS.
- `quote` — unevaluated structure → `lang.sym` / `lang.makeList` / `lang.makeSet` (reader `list` / `set` shapes and implicit lists).
- Collection literals `[...]` / `{...}` — `lang.conj` / `lang.makeList` / `lang.makeSet`; list or set `spread` lowered via `lang.isList` branch vs map `bind` entries (mirrors `lang.conj`).
- Clearer `emit:` errors for unsupported `label` lhs / bad `fn` arg specs.

Deliverable: typical non-destructuring emit coverage in tests; `(list …)` / `(set …)` calls still go through `emitCall` (runtime specials), not a separate emitter rule.

### Milestone 3 (done in `emit.js`)

Add binding and function features needed for real workloads:

- label destructuring parity with `evalBindLabel*` behavior
- function signatures using labels (e.g., `args:[x y]:{opt}`) via helper-based lowering
- nested `fn` emission strategy
- closure correctness tests (definition-time env capture)

Deliverable: functions and labels in emitter now match target Milestone 3 behavior, including left-to-right label chain binding order and definition-time closure capture.

#### destructuring examples & notes
| anascript | javascript |
| --------- | ---------- |
| `a:1` | `const __tmp1 = 1; env = env.set(sym('a'), __tmp1)` |
| `a:b:2` | `const __tmp2 = 2; env = env.set(sym('a'), __tmp2); env = env.set(sym('b'), __tmp2)` |
| `[a ...bs]:foo` | `const __tmp3 = env.get(sym('foo')); const __tmp4 = __tmp3.get(0); env = env.set(sym('a'), __tmp4); const __tmp5 = __tmp3.slice(1); env = env.set(sym('bs'), __tmp5);` |

- temp names are IIFE-local in emitted snippets so they do not leak or collide across nested emits.
- the actual emitted javascript for destructuring access into rhs values can reuse emitted `get` semantics where practical.
- This feels very complex. Perhaps some of the complexity should be handled in transform.js? Just a thought.

### Milestone 4 (done)

Operational hardening:

- add emitter/parity tests: evaluate same program through interpreter and emitted runtime, compare result
- burn down known parity gaps for call semantics, collection equality, and spread/destructure edge cases
- handle function-valued parity via behavior-focused checks (not strict function identity)
- benchmark interpreter vs emitted runtime on representative workloads

Deliverable (achieved): parity harness is green (including former todo gaps), and benchmark runs show strong emitted-runtime speedups (hundreds to low-thousands x on current workloads) before cutover.

## Cutover Plan (`eval.js` -> emitted runtime)

### Phase A: Optional path (no behavior risk)

- Add opt-in emitted execution mode (feature flag/env var).
- Keep interpreter as default.
- Run both paths in CI tests where possible.

### Phase B: Hybrid execution

- Use emitted runtime for known-supported forms.
- Fall back to interpreter for unsupported forms.
- Track fallback frequency to guide remaining work.

### Phase C: Default emitted path

- Flip default to emitted runtime once parity suite is green.
- Keep fallback available behind a debug/compat flag temporarily.

### Phase D: Cleanup

- Remove dead interpreter-only branches once confidence is high.
- Keep a compact reference evaluator only if useful for testing/spec purposes.

## Guardrails

- Do not change language semantics while the emitter is being built unless explicitly planned.
- Preserve closure semantics: function env snapshot at definition time.
- Keep commits small and milestone-based.
- Each milestone ends with:
  - lint green
  - tests green
  - updated docs/examples where behavior surface changes
