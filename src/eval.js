import im from 'immutable'

import * as lang from './lang.js'
import * as read from './read.js'
import * as print from './print.js'

// Evaluating
const getEnv = (env, exp) =>
  lang.is(exp, lang.sym('env'))
    ? env
    : env.get(exp)

const relabel = (exp, fn) =>
  lang.isForm(exp, 'label')
    ? exp.update(-1, x => relabel(x, fn))
    : fn(exp)

const getLabelKey = exp =>
  lang.isForm(exp, 'label')
    ? getLabelKey(exp.get(2))
    : exp

const unchainLabel = exp =>
  lang.isForm(exp, 'label')
    ? unchainLabel(exp.get(2)).insert(1, exp.get(1))
    : lang.makeList(exp)

const evalSpread = (exp, env) =>
  exp.update(1, x => evalSymCallAtom(x, env))

const evalBindLabelListList = (exp, env, val) =>
  exp
    .rest()
    .reduce((r, x) =>
      r
        .update('binds', y =>
          y.concat(
            evalLabelInner(lang.isForm(x, 'spread')
              ? relabel(x.get(1), y =>
                lang.makeForm('label', y, lang.makeForm('quote', val.slice(r.get('maxKey')))))
              : relabel(x, y =>
                lang.makeForm('label', y, lang.makeForm('quote', val.get(r.get('maxKey'))))),
            env)))
        .update('maxKey', i =>
          lang.isForm(x, 'spread')
            ? val.count()
            : i + 1),
    lang.makeSet(['binds', lang.makeList()], ['maxKey', 0]))
    .get('binds')

const evalBindLabelListSet = (exp, env, val) =>
  exp
    .rest()
    .reduce((r, x) =>
      r
        .update('binds', y =>
          y.concat(
            evalLabelInner(lang.isForm(x, 'spread')
              ? relabel(x.get(1), z =>
                lang.makeForm('label', z, lang.makeForm('quote', r.get('maxKey') !== undefined
                  ? val.deleteAll(im.Range(0, r.get('maxKey')))
                  : lang.makeSet())))
              : relabel(x, z =>
                lang.makeForm('label', z, lang.makeForm('quote', val.get(r.get('maxKey'))))),
            env)))
        .update('maxKey', i =>
          lang.isForm(x, 'spread')
            ? undefined
            : i + 1),
    lang.makeSet(['binds', lang.makeList()], ['maxKey', 0]))
    .get('binds')

const evalBindLabelSetList = (exp, env, val) =>
  exp
    .rest()
    .reduce((r, x) => {
      const key = lang.isForm(x, 'spread')
        ? undefined
        : evalCallAtom(getLabelKey(x), env)
      return r
        .update('binds', y =>
          y.concat(
            evalLabelInner(lang.isForm(x, 'spread')
              ? relabel(x.get(1), z =>
                lang.makeForm('label', z, lang.makeForm('quote', val.slice(r.get('maxKey') + 1))))
              : relabel(x, z =>
                lang.makeForm('label', z, lang.makeForm('quote', val.get(key)))),
            env)))
        .update('maxKey', y =>
          key > y
            ? key
            : y)
    },
    lang.makeSet(['binds', lang.makeList()], ['maxKey', 0]))
    .get('binds')

const evalBindLabelSetSet = (exp, env, val) =>
  exp
    .rest()
    .reduce((r, x) => {
      const key = lang.isForm(x, 'spread')
        ? undefined
        : evalCallAtom(getLabelKey(x), env)
      return r
        .update('binds', y =>
          y.concat(
            evalLabelInner(lang.isForm(x, 'spread')
              ? relabel(x.get(1), z =>
                lang.makeForm('label', z, lang.makeForm('quote', val.deleteAll(r.get('keysTaken')))))
              : relabel(x, z =>
                lang.makeForm('label', z, lang.makeForm('quote', val.get(key)))),
            env)))
        .update('keysTaken', y =>
          key !== undefined
            ? y.push(key)
            : y)
    },
    lang.makeSet(['binds', lang.makeList()], ['keysTaken', lang.makeList()]))
    .get('binds')

const evalBindLabel = (exp, env, val) =>
  lang.isForm(exp, 'list')
    ? lang.isList(val)
      ? evalBindLabelListList(exp, env, val)
      : lang.isSet(val)
        ? evalBindLabelListSet(exp, env, val)
        : lang.throwError(`Unable to use list destructure on ${lang.getType(val)}`)
    : lang.isForm(exp, 'set')
      ? lang.isList(val)
        ? evalBindLabelSetList(exp, env, val)
        : lang.isSet(val)
          ? evalBindLabelSetSet(exp, env, val)
          : lang.throwError(`Unable to use set destructure on ${lang.getType(val)}`)
      : lang.makeList(lang.makeForm('bind', evalCallAtom(exp, env), val))

const evalLabelInner = (exp, env) => {
  const exps = unchainLabel(exp)
  const val = evalSymCallAtom(exps.first(), env)
  return exps
    .rest()
    .flatMap(label => evalBindLabel(label, env, val))
}

const evalLabel = (exp, env) =>
  lang.makeForm('binds', ...evalLabelInner(exp, env))

const evalExpand = (exp, env) =>
  getEnv(env, evalCallAtom(exp.get(1), env))

const evalQuote = (exp, _env) =>
  exp.get(1)

const evalDo = (exp, env) =>
  exp
    .rest()
    .reduce((env, x) =>
      lang.conj(
        env,
        evalSymCallAtom(lang.makeForm('label', lang.sym('_'), x), env)),
    env)
    .get(lang.sym('_'))

const evalEval = (exp, env) =>
  evalSymCallAtom(evalSymCallAtom(exp.get(1), env), env)

const evalEval2 = (exp, env) =>
  evalCallAtom(evalSymCallAtom(exp.get(1), env), env)

const evalIf = (exp, env) =>
  evalSymCallAtom(exp.get(1), env)
    ? evalSymCallAtom(exp.get(2), env)
    : evalSymCallAtom(exp.get(3), env)

const evalNot = (exp, env) =>
  exp.count() === 1
    ? null
    : exp.count() === 2
      ? !evalSymCallAtom(exp.get(1), env)
      : (evalSymCallAtom(exp.get(1), env) &&
        exp.skip(2).every(x => !evalSymCallAtom(x, env)))

const evalAnd = (exp, env) =>
  exp.skip(1).every(x => evalSymCallAtom(x, env))

const evalOr = (exp, env) =>
  exp.skip(1).some(x => evalSymCallAtom(x, env))

const evalLet = (exp, env) =>
  evalSymCallAtom(
    exp.get(2),
    env.merge(evalSymCallAtom(
      exp.get(1),
      env)))

const evalFn = (exp, env) => {
  const fn = (...args) =>
    evalSymCallAtom(
      lang.makeForm('do',
        relabel(exp.get(1), x =>
          lang.makeForm('label', x,
            lang.makeForm('list', ...args.map(arg =>
              lang.makeForm('quote', arg))))),
        ...exp.slice(2)
      ), env)
  fn.anaSig = print.printSyntax(exp.get(1))
  return fn
}

const evalConj = (exp, env) =>
  lang.conj(...exp
    .rest()
    .map(x => evalSymCallAtom(x, env))
    .toArray())

const evalList = (exp, env) =>
  evalSymCallAtom(
    lang.makeForm('conj', lang.makeForm('quote', lang.makeList()), ...exp.rest()),
    env)

const evalSet = (exp, env) =>
  evalSymCallAtom(
    lang.makeForm('conj', lang.makeForm('quote', lang.makeSet()), ...exp.rest()),
    env)

const special = fn => {
  fn.special = true
  return fn
}

const isSpecial = (fn) =>
  'special' in fn

const evalCall = (exp, env) => {
  const fn = evalSymCallAtom(exp.first(), env)
  if (!lang.isFn(fn)) {
    lang.throwError(`${print.print(env.get('evalForm'))}
       ^ ${print.print(exp)} is ${fn} and not callable.`)
  }
  const fn2 = isSpecial(fn)
    ? fn
    : (exp, env) =>
        fn(...exp
          .rest()
          .map(x => evalSymCallAtom(x, env))
          .flatMap(x => lang.isForm(x, 'spread')
            ? x.get(1)
            : lang.makeList(x))
          .toArray())
  return fn2(exp, env)
}

const evalSym = (exp, env) =>
  getEnv(env, exp)

const evalAtom = (exp, _env) =>
  exp // atoms always eval to themselves (even syms!)

const evalCallAtom = (exp, env) =>
  lang.isList(exp)
    ? evalCall(exp, env)
    : evalAtom(exp, env)

const evalSymCallAtom = (exp, env) =>
  lang.isSym(exp)
    ? evalSym(exp, env)
    : evalCallAtom(exp, env)

// General
export const applyExp = (env, exp) => {
  const val = evalSymCallAtom(
    lang.makeForm(
      'label',
      lang.sym('_'),
      lang.makeForm(
        'label',
        getEnv(env, 'expTotal'),
        exp)),
    env.set('evalForm', exp))
  return lang.conj(env, val)
    .update('expTotal', x => x + 1)
    .update('vals', x => x.push(val))
}

const get = (col, k, d) =>
  lang.isList(col) || lang.isSet(col)
    ? col.get(k, d)
    : lang.throwError(`Unable to get from type ${lang.getType(col)}. Must be type set or list`)

const assoc = (col, k, v) => col.set(k, v)
const dissoc = (col, k) => col.delete(k)
const push = (col, v) => col.push(v)
const pop = col => col.pop()
const first = col => col.first()
const last = col => col.last()
const count = col => col.count()
const add = (...xs) => xs.reduce((t, x) => t + x, 0)
const subtract = (...xs) => xs.length === 0
  ? NaN
  : xs.length === 1
    ? -xs[0]
    : xs.reduce((t, x) => t - x)
const multiply = (...xs) => xs.reduce((t, x) => t * x, 1)
const divide = (...xs) => xs.length === 0
  ? NaN
  : xs.reduce((t, x) => t / x)
const identity = x => x

const defEnv = x =>
  lang.makeSet(...Object.entries(x)
    .map(([s, f]) => [lang.sym(s), f]))

export const initialEnv = defEnv({
  label: special(evalLabel),
  expand: special(evalExpand),
  quote: special(evalQuote),
  spread: special(evalSpread),
  list: special(evalList),
  set: special(evalSet),

  do: special(evalDo),
  eval: special(evalEval),
  eval2: special(evalEval2),
  if: special(evalIf),
  let: special(evalLet),
  fn: special(evalFn),
  conj: special(evalConj),
  not: special(evalNot),
  and: special(evalAnd),
  or: special(evalOr),

  read: read.read,
  type: lang.getType,
  'list*': lang.makeList,
  'set*': lang.makeSet,
  'list?': lang.isList,
  'set?': lang.isSet,
  'complement?': lang.isComplement,
  'fn?': lang.isFn,
  'neg?': lang.isNeg,
  'pos?': lang.isPos,
  'zero?': lang.isZero,
  'number?': lang.isNumber,
  'subset?': lang.isSubset,
  'superset?': lang.isSuperset,
  complement: lang.complement,
  keys: lang.keys,
  assoc,
  dissoc,
  push,
  pop,
  first,
  last,
  get,
  count,
  identity,
  str: lang.str,
  sym: lang.sym,

  '=': lang.is,
  abs: lang.abs,
  remove: lang.difference,
  keep: lang.intersection,
  merge: lang.union,
  'bit-not': lang.bitNot,
  'bit-and': lang.bitAnd,
  'bit-or': lang.bitOr,
  'bit-xor': lang.bitXor,
  '+': add,
  '-': subtract,
  '*': multiply,
  '/': divide,
  pow: Math.pow,
  log: Math.log,
  log10: Math.log10,
  log2: Math.log2
}).set('expTotal', 1)
