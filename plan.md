# The Plan

Goal: build a small Lisp with a well defined grammar. The language should be
compiled into javascript. It is a purely evaluative language with no side
effects.

Future Goal: to promote the use of reactive transducer framework in languages
like javascript and clojure. Be able to write all programs using rxf for
personal and profesional success.

## Next Steps

- Complete `emit.js` so anascript forms compile into explicit JS expressions.
- Keep interpreter behavior as the semantic reference until emitter parity is proven.
- Cut over execution from `eval.js` to emitted JS in controlled phases.

## Current State

- Runtime execution path:
  - `repl.js` -> `makeEnv().eval(...)` -> `eval.js` interpreter (`applyExp` / special forms).
- Emitter path:
  - `emit.js` exists and is tested, but is not yet used for runtime execution.
  - Implemented so far: literals, symbols, calls, `label` (symbol/string/number lhs), `fn` (simple params), `do`, `expand`.
- Language semantics to preserve:
  - Functions close over environment at definition time (no late rebinding from outer eval state).
  - Labels behave like flattened sequential `let*` bindings.
  - Negative sets represented with `{~ ...}` conventions already established.

## Architecture Direction

Build and stabilize this pipeline:

1. source -> `read.parse`/`read.transform` -> Lisp forms
2. Lisp forms -> `emit.js` -> JS source string
3. JS source string -> runtime evaluation in a controlled closure (`lang`, `env`)

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

### Milestone 2 (next)

Add missing core special forms and data forms with no destructuring:

- `quote`
- `if`
- collection literals (`list`, `set`) including spread basics where possible
- comments as no-op in emitted expressions
- stricter unsupported-form errors with useful context

Deliverable: emitted output covers typical non-destructuring programs used in examples/tests.

### Refactor Work (immediate)

Before extending `emit.js` further, cleanly separate responsibilities in reader/transform code:

- Extract transform logic from `read.js` into `transform.js`:
  - keep the single-pass composed transform walk design
  - preserve behavior exactly (no semantic changes during move)
- Make `read.js` responsible only for:
  - parsing (`parse`)
  - lisp-form emission (`emitLisp`, `read`)
  - tree visualization (`emitTree`)
- Remove legacy JS emission code from `read.js` (`emitJS`, `testJS`, and related helpers).
- Ensure all existing tests still pass after the refactor.

Deliverable: `read.js` becomes a small parser/reader module, transform concerns live in `transform.js`, and all JS emission concerns live in `emit.js`.

### Milestone 3

Add binding and function features needed for real workloads:

- label destructuring parity with `evalBindLabel*` behavior
- function signatures using labels (e.g., `args:[x y]:{opt}`) via helper-based lowering
- nested `fn` emission strategy
- closure correctness tests (definition-time env capture)

Deliverable: functions and labels in emitter match interpreter behavior for existing tests.

### Milestone 4

Operational hardening:

- add emitter snapshot tests for representative forms
- add parity tests: evaluate same program through interpreter and emitted runtime, compare result
- add failure-mode tests for unsupported syntax with clear messages
- benchmark interpreter vs emitted runtime on hot function loops

Deliverable: confidence + performance data before cutover.

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

- Do not change language semantics while emitter is being built unless explicitly planned.
- Preserve closure semantics: function env snapshot at definition time.
- Keep commits small and milestone-based.
- Each milestone ends with:
  - lint green
  - tests green
  - updated docs/examples where behavior surface changes
