import * as lang from './lang.js'
import { read } from './read.js'
import { applyExp, initialEnv } from './eval.js'
import { emitAstExpr } from './emit.js'

export { sym, toJS } from './lang.js'
export { read, parse, transform } from './read.js'
export { print, printLabel, printSyntax } from './print.js'
export { emitAstExpr, emitAstResult, emitExpr, emitResult, emitSourceExpr } from './emit.js'

const getProcessEnv = () =>
  (typeof process !== 'undefined' && process?.env) ? process.env : {}

const envFlag = (name) => {
  const v = getProcessEnv()[name]
  return v === '1' || v === 'true' || v === 'yes'
}

const envRuntime = () =>
  getProcessEnv().ANASCRIPT_RUNTIME === 'emit' ? 'emit' : 'eval'

const parityEqual = (a, b) => {
  if (typeof a === 'function' || typeof b === 'function') {
    return typeof a === 'function' &&
      typeof b === 'function' &&
      (a.anaSig ?? null) === (b.anaSig ?? null)
  }
  return lang.is(a, b)
}

const emitApplyExp = (env, exp) => {
  const evalFormEnv = env.set('evalForm', exp)
  const expKey = evalFormEnv.get('expTotal')
  const wrapped = lang.makeForm(
    'label',
    lang.sym('_'),
    lang.makeForm('label', expKey, exp))
  const code = `return (${emitAstExpr(wrapped, 'env')})`
  // eslint-disable-next-line no-new-func
  const run = Function('lang', 'env', code)
  const nextEnv = run(lang, evalFormEnv)
  const changedBinds = nextEnv
    .entrySeq()
    .filter(([k, v]) =>
      !lang.is(k, lang.sym('_')) &&
      !lang.is(k, expKey) &&
      (!evalFormEnv.has(k) || !lang.is(evalFormEnv.get(k), v)))
    .map(([k, v]) => lang.makeForm('bind', k, v))
  const orderedBinds = lang.makeList(
    lang.makeForm('bind', lang.sym('_'), nextEnv.get(lang.sym('_'))),
    lang.makeForm('bind', expKey, nextEnv.get(expKey)),
    ...changedBinds.toArray())
  const val = lang.makeForm('binds', ...orderedBinds.toArray())
  return lang.conj(nextEnv, val)
    .update('expTotal', x => x + 1)
    .update('vals', x => x.push(val))
}

class Env {
  constructor (envMap, options = {}) {
    this.envMap = envMap
    this.runtime = options.runtime ?? envRuntime()
    this.paritySample = options.paritySample ?? envFlag('ANASCRIPT_PARITY_SAMPLE')
  }

  eval (s) {
    const reducer = this.runtime === 'emit'
      ? (env, exp) => {
          const emitted = emitApplyExp(env, exp)
          if (!this.paritySample) return emitted
          const interpreted = applyExp(env, exp)
          if (!parityEqual(emitted.get(lang.sym('_')), interpreted.get(lang.sym('_')))) {
            throw new Error('Runtime parity mismatch between emitted and interpreter execution')
          }
          return emitted
        }
      : applyExp
    this.envMap = read(s)
      .reduce(reducer,
        this.envMap.set('vals', lang.makeList()))
    return this.envMap
      .get('vals')
  }
}

export const makeEnv = (envMap = initialEnv, options = {}) =>
  new Env(envMap, options)
