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

test('emit parity helper', () => {
  expect.hasAssertions()
  expectParity('42')
  expectParity('a:1 $a')
  expectParity('a:b:2 [a b]')
  expectParity('[x ...xs]:[1 2 3] [x xs]')
  expectParity('(if true [1 2] {3 4})')
})
