'use strict'

const im = require('immutable')

const lang = require('./lang')
const read = require('./read')
const print = require('./print')

// Evaluating
const getEnv = (env, exp) =>
  lang.is(exp, lang.sym('env'))
    ? env
    : env.get(exp)

const asLabel = exp =>
  lang.isForm(exp, 'label')
    ? exp
    : lang.makeForm('label', exp, exp)

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
              : relabel(asLabel(x), _ =>
                lang.makeForm('quote', val.get(key))),
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
              : relabel(asLabel(x), _ =>
                lang.makeForm('quote', val.get(key))),
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

const evalLet = (exp, env) =>
  evalSymCallAtom(
    exp.get(2),
    env.merge(evalSymCallAtom(
      exp.get(1),
      env)))

const evalFn = (exp, env) =>
  (...args) =>
    evalSymCallAtom(
      lang.makeForm('do',
        relabel(exp.get(1), x =>
          lang.makeForm('label', x, lang.makeForm('list', ...args))),
        ...exp.slice(2)
      ), env)

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
  if (typeof fn !== 'function') {
    throw new Error(`${print.print(env.get('evalForm'))}
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
const applyExp = (env, exp) => {
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

const initialEnv = lang.makeSet(
  [lang.sym('label'), special(evalLabel)],
  [lang.sym('expand'), special(evalExpand)],
  [lang.sym('quote'), special(evalQuote)],
  [lang.sym('spread'), special(evalSpread)],

  [lang.sym('do'), special(evalDo)],
  [lang.sym('eval'), special(evalEval)],
  [lang.sym('eval2'), special(evalEval2)],
  [lang.sym('if'), special(evalIf)],
  [lang.sym('let'), special(evalLet)],
  [lang.sym('fn'), special(evalFn)],
  [lang.sym('conj'), special(evalConj)],
  [lang.sym('list'), special(evalList)],
  [lang.sym('set'), special(evalSet)],

  [lang.sym('read'), str => read.read(str).first()],

  [lang.sym('list*'), lang.makeList],
  [lang.sym('set*'), lang.makeSet],
  [lang.sym('list?'), lang.isList],
  [lang.sym('set?'), lang.isSet],
  [lang.sym('assoc'), (col, k, v) => col.set(k, v)],
  [lang.sym('dissoc'), (col, k) => col.delete(k)],
  [lang.sym('push'), (col, v) => col.push(v)],
  [lang.sym('pop'), col => col.pop()],
  [lang.sym('first'), col => col.first()],
  [lang.sym('last'), col => col.last()],
  [lang.sym('get'), get],
  [lang.sym('count'), col => col.count()],

  [lang.sym('type'), lang.getType],

  [lang.sym('+'), (...xs) => xs.reduce((t, x) => t + x, 0)],
  [lang.sym('-'), (...xs) => xs.reduce((t, x) => t - x)],
  [lang.sym('identity'), x => x],

  ['expTotal', 1])

module.exports = {
  applyExp,
  initialEnv
}
