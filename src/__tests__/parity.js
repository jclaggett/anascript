import {
  makeEnv,
  emitAstExpr,
  read,
  toJS
} from '../index'
import * as lang from '../lang.js'

const RE = str =>
  makeEnv().eval(str)?.last()?.last()?.last()

const runEmitted = (src) => {
  let env = makeEnv().envMap
  let val
  for (const exp of read(src)) {
    const code = `
      const val = ${emitAstExpr(exp, 'env')}
      return { env, val }
    `
    // eslint-disable-next-line no-new-func
    const fn = Function('lang', 'env', code)
    const out = fn(lang, env)
    env = out.env
    val = out.val
  }
  return val
}

const expectParity = (src) => {
  const interp = RE(src)
  const emitted = runEmitted(src)
  expect(toJS(emitted))
    .toStrictEqual(toJS(interp))
}

const parityCases = {
  core: [
    '42',
    'a:1 $a',
    'a:b:2 [a b]',
    '(if true [1 2] {3 4})',
    '(if false [1 2] {3 4})',
    '[1 ...[2 3 4]]',
    '{1 ...{2 3 4}}',
    '(do a:1 b:2 [a b])'
  ],
  destructure: [
    '[x ...xs]:[1 2 3] [x xs]',
    '[a ...[b ...c]]:[1 2 3] [a b c]'
  ],
  fn: [
    '((fn x x) 42)',
    '((fn [x y] [x y]) 1 2)',
    '((fn [x ...xs] [x xs]) 1 2 3)',
    '((fn {a b:0} [a b]) 1 2)'
  ]
}

test('emit parity matrix', () => {
  expect.hasAssertions()
  for (const [category, cases] of Object.entries(parityCases)) {
    for (const src of cases) {
      try {
        expectParity(src)
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        throw new Error(`[parity:${category}] ${src}\n${detail}`)
      }
    }
  }
})

test.todo('emit parity known gap: variadic fn args symbol ((fn args (+ ...args)) 1 2 3)')
test.todo('emit parity known gap: collection equality (= [1 2] [1 2])')
test.todo('emit parity known gap: list spread from set rhs [a b ...c ...d]: {0:1 1:2 2:3} [a b c d]')
test.todo('emit parity known gap: set spread from set rhs {a ...rest}:{a:1 "b":2 "c":3} [a rest]')
test.todo('emit parity known gap: set numeric keys with spread {a:0 b:1 ...c}: [1, 2, 3] [a b c]')
test.todo('emit parity known gap: function identity/value equality ((fn x (fn y x)) 42 0)')
test.todo('emit parity known gap: call lhs in fn signature ((fn (+ 1 1) $2) 42)')
test.todo('emit parity known gap: call lhs label expansion (+ 1 1):42 $2')

const makeRng = (seed) => {
  let s = seed >>> 0
  return () => {
    s = (1664525 * s + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const pick = (rng, xs) =>
  xs[Math.floor(rng() * xs.length)]

const genNum = (rng) =>
  Math.floor(rng() * 6)

const genAtom = (rng) =>
  pick(rng, [
    String(genNum(rng)),
    String(genNum(rng)),
    'true',
    'false'
  ])

const genExpr = (rng, depth) => {
  if (depth <= 0) return genAtom(rng)
  const tag = pick(rng, ['atom', 'if', 'sum', 'list'])
  if (tag === 'atom') return genAtom(rng)
  if (tag === 'if') {
    return `(if ${genAtom(rng)} ${genExpr(rng, depth - 1)} ${genExpr(rng, depth - 1)})`
  }
  if (tag === 'sum') {
    return `(+ ${genExpr(rng, depth - 1)} ${genExpr(rng, depth - 1)})`
  }
  return `[${genExpr(rng, depth - 1)} ${genExpr(rng, depth - 1)}]`
}

test('emit parity generated expressions', () => {
  const rng = makeRng(0xc0ffee)
  const generated = Array.from({ length: 25 }, () => genExpr(rng, 2))
  expect(generated.length).toStrictEqual(25)
  for (const src of generated) {
    expect(() => expectParity(src))
      .not
      .toThrow(`[parity:generated] ${src}`)
  }
})
