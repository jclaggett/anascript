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
    '{1 ...{2 3 4}}'
  ],
  destructure: [
    '[x ...xs]:[1 2 3] [x xs]',
    '[a b ...c ...d]: {0:1 1:2 2:3} [a b c d]',
    '{a ...rest}:{a:1 "b":2 "c":3} [a rest]',
    '{a:0 b:1 ...c}: [1, 2, 3] [a b c]'
  ],
  fn: [
    '((fn x x) 42)',
    '((fn [x y] [x y]) 1 2)',
    '((fn args (+ ...args)) 1 2 3)',
    '((fn x (fn y x)) 42 0)',
    '((fn (+ 1 1) $2) 42)'
  ]
}

test('emit parity matrix', () => {
  for (const [category, cases] of Object.entries(parityCases)) {
    for (const src of cases) {
      expect(() => expectParity(src))
        .not
        .toThrow(`[parity:${category}] ${src}`)
    }
  }
})
