import * as lang from './lang.js'
import { read } from './read.js'

const q = (s) => JSON.stringify(s)

const assert = (ok, msg) => {
  if (!ok) {
    throw new Error(`emit: ${msg}`)
  }
}

const emitLiteral = (exp) =>
  exp === undefined
    ? 'undefined'
    : JSON.stringify(exp)

const emitSym = (exp, envName) =>
  `${envName}.get(lang.sym(${q(exp.sym)}))`

const emitCall = (exp, envName) => {
  assert(lang.isList(exp) && exp.count() > 0, 'call expects non-empty list')
  const fnText = emitExpr(exp.first(), envName)
  const argsText = exp
    .rest()
    .map(arg => emitExpr(arg, envName))
    .join(', ')
  return `${fnText}(lang.makeList(${argsText}))`
}

const emitLabel = (exp, envName) => {
  assert(lang.isForm(exp, 'label'), 'label form expected')
  const lhs = exp.get(1)
  assert(lang.isSym(lhs), 'only symbol labels are supported in milestone 1')
  const rhs = exp.get(2)
  return `${envName} = ${envName}.set(lang.sym(${q(lhs.sym)}), ${emitExpr(rhs, envName)})`
}

const emitFn = (exp, envName) => {
  assert(lang.isForm(exp, 'fn'), 'fn form expected')
  assert(exp.count() >= 3, 'fn requires params and body')
  const argSpec = exp.get(1)
  const body = exp.slice(2)
  const fnEnv = 'fnEnv'
  let bindText = ''
  if (lang.isSym(argSpec)) {
    bindText = `${fnEnv} = ${fnEnv}.set(lang.sym(${q(argSpec.sym)}), args);`
  } else if (lang.isForm(argSpec, 'list')) {
    const syms = argSpec.rest().toArray()
    assert(syms.every(lang.isSym), 'list arg spec only supports symbols')
    bindText = syms
      .map((s, i) =>
        `${fnEnv} = ${fnEnv}.set(lang.sym(${q(s.sym)}), args.get(${i}));`)
      .join(' ')
  } else {
    throw new Error('emit: fn arg spec must be symbol or list')
  }
  const bodyExpr = body.size === 1
    ? emitExpr(body.first(), fnEnv)
    : emitDo(lang.makeForm('do', ...body), fnEnv)
  return `(args) => { let ${fnEnv} = ${envName}; ${bindText} return ${bodyExpr}; }`
}

const emitDo = (exp, envName) => {
  assert(lang.isForm(exp, 'do'), 'do form expected')
  const xs = exp.rest().toArray()
  if (xs.length === 0) {
    return 'undefined'
  }
  if (xs.length === 1) {
    return emitExpr(xs[0], envName)
  }
  const lines = xs
    .slice(0, -1)
    .map(x => `__tmp = ${emitExpr(x, envName)};`)
    .join(' ')
  return `(() => { let __tmp; ${lines} return ${emitExpr(xs[xs.length - 1], envName)}; })()`
}

export const emitExpr = (exp, envName = 'env') => {
  if (lang.isSym(exp)) {
    return emitSym(exp, envName)
  }
  if (lang.isList(exp)) {
    if (lang.isForm(exp, 'label')) return emitLabel(exp, envName)
    if (lang.isForm(exp, 'fn')) return emitFn(exp, envName)
    if (lang.isForm(exp, 'do')) return emitDo(exp, envName)
    return emitCall(exp, envName)
  }
  return emitLiteral(exp)
}

export const emitResult = (exp, resultSym = 'result', envName = 'env') =>
  `${envName} = ${envName}.set(lang.sym(${q(resultSym)}), ${emitExpr(exp, envName)})`

export const emitSourceExpr = (src, envName = 'env') =>
  emitExpr(read(src).first(), envName)
