'use strict'

const fs = require('fs')
const path = require('path')

const chalk = require('chalk')
const ebnf = require('ebnf')
const im = require('immutable')

const {
  conj,
  get,
  getDefault,
  getType,
  is,
  isForm,
  isList,
  isSet,
  isSym,
  makeBind,
  makeForm,
  makeLabel,
  makeList,
  makeQuote,
  makeSet,
  makeSym,
  sym,
  syms,
  throwError,
  toJS
} = require('./lang')

// Parsing

const anaParser = new ebnf.Grammars.W3C.Parser(
  fs.readFileSync(path.resolve(__dirname, 'ana.ebnf.w3c'))
    .toString())

const parse = str => {
  const ast = anaParser.getAST(str + ' ')

  if (!ast) {
    throw new Error('Failed to parse input')
  }

  return ast
}

// Forming

const formChildren = ast =>
  makeList(...ast.children
    .map(form)
    .filter(x => !isForm(x, 'comment')))

const formChild = ast =>
  ast.children.length > 0
    ? form(ast.children[0])
    : makeList()
const formSymList = (name, formFn) =>
  ast =>
    makeForm(name, ...formFn(ast))

const formRules = {
  forms: formChildren,
  form1: formChild,
  form2: formChild,
  form3: formChild,
  form4: formChild,

  comment: formSymList('comment', formChildren),
  label: formSymList('label', formChildren),
  expand: formSymList('expand', formChildren),
  quote: formSymList('quote', formChildren),
  spread: formSymList('spread', formChildren),
  round: formChild,
  square: formSymList('list', formChild),
  curly: formSymList('set', formChild),
  complement: formSymList('complement', formChildren),

  number: ast => parseFloat(ast.text),
  string: ast => ast.text.substr(1, ast.text.length - 2),
  boolean: ast => ast.text === 'true',
  null: _ast => null,
  undefined: _ast => undefined,
  symbol: ast => syms[ast.text] || makeSym(ast.text)
}

const form = ast => {
  if (!(ast.type in formRules)) {
    throw new Error(`Unknown AST Type: ${ast.type}`)
  }
  return formRules[ast.type](ast)
}

// Evaluating
const getEnv = (env, exp) =>
  is(exp, sym('env'))
    ? env
    : env.get(exp)

const special = fn => {
  fn.special = true
  return fn
}

const asLabel = exp =>
  isForm(exp, 'label')
    ? exp
    : makeLabel(exp, exp)

const relabel = (exp, fn) =>
  isForm(exp, 'label')
    ? exp.update(-1, x => relabel(x, fn))
    : fn(exp)

const getLabelKey = exp =>
  isForm(exp, 'label')
    ? getLabelKey(exp.get(2))
    : exp

const unchainLabel = exp =>
  isForm(exp, 'label')
    ? unchainLabel(exp.get(2)).insert(1, exp.get(1))
    : makeList(exp)

const evalSpread = (exp, env) =>
  exp.update(1, x => evalSymCallAtom(x, env))

const evalBindLabelListList = (exp, env, val) =>
  exp
    .rest()
    .reduce((r, x) =>
      r
        .update('binds', y =>
          y.concat(
            evalLabelInner(isForm(x, 'spread')
              ? relabel(x.get(1), y =>
                makeLabel(y, makeQuote(val.slice(r.get('maxKey')))))
              : relabel(x, y =>
                makeLabel(y, makeQuote(val.get(r.get('maxKey'))))),
            env)))
        .update('maxKey', i =>
          isForm(x, 'spread')
            ? val.count()
            : i + 1),
    im.fromJS({ binds: [], maxKey: 0 }))
    .get('binds')

const evalBindLabelListSet = (exp, env, val) =>
  exp
    .rest()
    .reduce((r, x) =>
      r
        .update('binds', y =>
          y.concat(
            evalLabelInner(isForm(x, 'spread')
              ? relabel(x.get(1), y =>
                makeLabel(y, makeQuote(r.get('maxKey') !== undefined
                  ? val.deleteAll(im.Range(0, r.get('maxKey')))
                  : makeSet())))
              : relabel(x, y =>
                makeLabel(y, makeQuote(val.get(r.get('maxKey'))))),
            env)))
        .update('maxKey', i =>
          isForm(x, 'spread')
            ? undefined
            : i + 1),
    im.fromJS({ binds: [], maxKey: 0 }))
    .get('binds')

const evalBindLabelSetList = (exp, env, val) =>
  exp
    .rest()
    .reduce((r, x) => {
      const key = isForm(x, 'spread')
        ? undefined
        : evalCallAtom(getLabelKey(x), env)
      return r
        .update('binds', y =>
          y.concat(
            evalLabelInner(isForm(x, 'spread')
              ? relabel(x.get(1), z =>
                makeLabel(z, makeQuote(val.slice(r.get('maxKey') + 1))))
              : relabel(asLabel(x), _ =>
                makeQuote(val.get(key))),
            env)))
        .update('maxKey', y =>
          key > y
            ? key
            : y)
    },
    im.fromJS({ binds: [], maxKey: 0 }))
    .get('binds')

const evalBindLabelSetSet = (exp, env, val) =>
  exp
    .rest()
    .reduce((r, x) => {
      const key = isForm(x, 'spread')
        ? undefined
        : evalCallAtom(getLabelKey(x), env)
      return r
        .update('binds', y =>
          y.concat(
            evalLabelInner(isForm(x, 'spread')
              ? relabel(x.get(1), z =>
                makeLabel(z, makeQuote(val.deleteAll(r.get('keysTaken')))))
              : relabel(asLabel(x), _ =>
                makeQuote(val.get(key))),
            env)))
        .update('keysTaken', y =>
          key !== undefined
            ? y.push(key)
            : y)
    },
    im.fromJS({ binds: [], keysTaken: [] }))
    .get('binds')

const evalBindLabel = (exp, env, val) =>
  isForm(exp, 'list')
    ? getType(val) === 'list'
      ? evalBindLabelListList(exp, env, val)
      : getType(val) === 'set'
        ? evalBindLabelListSet(exp, env, val)
        : throwError(`Unable to use list destructure on ${getType(val)}`)
    : isForm(exp, 'set')
      ? getType(val) === 'list'
        ? evalBindLabelSetList(exp, env, val)
        : getType(val) === 'set'
          ? evalBindLabelSetSet(exp, env, val)
          : throwError(`Unable to use set destructure on ${getType(val)}`)
      : makeList(makeBind(evalCallAtom(exp, env), val))

const evalLabelInner = (exp, env) => {
  const exps = unchainLabel(exp)
  const val = evalSymCallAtom(exps.first(), env)
  return exps
    .rest()
    .flatMap(label => evalBindLabel(label, env, val))
}

const evalLabel = (exp, env) =>
  evalLabelInner(exp, env).unshift(sym('binds'))

const evalExpand = (exp, env) =>
  getEnv(env, evalCallAtom(exp.get(1), env))

const evalQuote = (exp, _env) =>
  exp.get(1)

const evalDo = (exp, env) =>
  exp
    .rest()
    .reduce((env, x) =>
      conj(
        env,
        evalSymCallAtom(makeLabel(sym('_'), x), env)),
    env)
    .get(sym('_'))

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
      makeForm('do',
        relabel(exp.get(1), x =>
          makeLabel(x, makeForm('list', ...args))),
        ...exp.slice(2)
      ), env)

const evalConj = (exp, env) =>
  conj(...exp
    .rest()
    .map(x => evalSymCallAtom(x, env))
    .toArray())

const evalList = (exp, env) =>
  evalSymCallAtom(
    makeForm('conj', makeQuote(makeList()), ...exp.rest()),
    env)

const evalSet = (exp, env) =>
  evalSymCallAtom(
    makeForm('conj', makeQuote(makeSet()), ...exp.rest()),
    env)

const isSpecial = (fn) =>
  'special' in fn

const evalCall = (exp, env) => {
  const fn = evalSymCallAtom(exp.first(), env)
  if (typeof fn !== 'function') {
    throw new Error(`${print(env.get('evalForm'))}
       ^ ${print(exp)} is ${fn} and not callable.`)
  }
  const fn2 = isSpecial(fn)
    ? fn
    : (exp, env) =>
        fn(...exp
          .rest()
          .map(x => evalSymCallAtom(x, env))
          .flatMap(x => isForm(x, 'spread')
            ? x.get(1)
            : makeList(x))
          .toArray())
  return fn2(exp, env)
}

const evalSym = (exp, env) =>
  getEnv(env, exp)

const evalAtom = (exp, _env) =>
  exp // atoms always eval to themselves (even syms!)

const evalCallAtom = (exp, env) =>
  isList(exp)
    ? evalCall(exp, env)
    : evalAtom(exp, env)

const evalSymCallAtom = (exp, env) =>
  isSym(exp)
    ? evalSym(exp, env)
    : evalCallAtom(exp, env)

// Printing
const printRules = {
  list: (x, r) =>
    isSym(x.first())
      ? r.round(x, r)
      : r.square(x, r),
  set: (x, r) =>
    chalk.cyan('{') +
    x.map((v, k) =>
      is(k, v)
        ? print(k, r)
        : printLabel(makeLabel(k, v), r))
      .join(', ') +
    chalk.cyan('}'),
  square: (x, r) =>
    chalk.cyan('[') + printChildren(x, r, ', ') + chalk.cyan(']'),
  round: (x, r) =>
    chalk.cyan('(') + printChildren(x, r) + chalk.cyan(')'),
  symbol: x => (x.sym in syms ? chalk.blue.bold : chalk.blue)(x.sym),
  string: x => chalk.green(`"${x}"`),
  boolean: x => chalk.yellow(x),
  number: x => chalk.yellow(x),
  undefined: x => chalk.yellow(x),
  object: x => chalk.yellow(x),
  function: x => chalk.yellow(`<${x.name ?? 'fn'}>`),
  label: (x, r) => printChildren(x.rest(), r, chalk.cyan(': '))

  // For now, these forms are just printed as lists
  // comment: (x, r) => chalk.dim.strikethrough('#' + printChildren(x.rest(), r)),
  // expand: x => chalk.cyan('$') + printChildren(x.rest()),
  // quote: x => chalk.cyan('\\') + printChildren(x.rest())
}

const printLabel = (x, r = printRules) =>
  r.label(x, r)

const printChildren = (x, rules, sep = ' ') =>
  x.map(child => print(child, rules)).join(sep)

const print = (x, r = printRules) =>
  getDefault(r, getType(x), x => x)(x, r)

// General
const applyExp = (env, exp) => {
  const val = evalSymCallAtom(
    makeLabel(
      sym('_'),
      makeLabel(
        getEnv(env, 'expTotal'),
        exp)),
    env.set('evalForm', exp))
  return conj(env, val)
    .update('expTotal', x => x + 1)
    .update('vals', x => x.push(val))
}

const read = str =>
  form(parse(str))

const readEval = (env, str) =>
  read(str)
    .reduce(applyExp, env.set('vals', makeList()))

const initialEnv = makeSet(
  [sym('label'), special(evalLabel)],
  [sym('expand'), special(evalExpand)],
  [sym('quote'), special(evalQuote)],
  [sym('spread'), special(evalSpread)],

  [sym('do'), special(evalDo)],
  [sym('eval'), special(evalEval)],
  [sym('eval2'), special(evalEval2)],
  [sym('if'), special(evalIf)],
  [sym('let'), special(evalLet)],
  [sym('fn'), special(evalFn)],
  [sym('conj'), special(evalConj)],
  [sym('list'), special(evalList)],
  [sym('set'), special(evalSet)],

  [sym('read'), str => read(str).first()],

  [sym('list*'), (...xs) => makeList(...xs)],
  [sym('set*'), (...xs) => makeSet(...xs)],
  [sym('list?'), isList],
  [sym('set?'), isSet],
  [sym('assoc'), (col, k, v) => col.set(k, v)],
  [sym('dissoc'), (col, k) => col.delete(k)],
  [sym('push'), (col, v) => col.push(v)],
  [sym('pop'), col => col.pop()],
  [sym('first'), col => col.first()],
  [sym('last'), col => col.last()],
  [sym('get'), get],
  [sym('count'), col => col.count()],

  [sym('type'), getType],

  [sym('+'), (...xs) => xs.reduce((t, x) => t + x, 0)],
  [sym('-'), (...xs) => xs.reduce((t, x) => t - x)],
  [sym('identity'), x => x],

  ['expTotal', 1])

module.exports = {
  form,
  initialEnv,
  makeList,
  makeSet,
  makeSym,
  parse,
  print,
  printLabel,
  read,
  readEval,
  sym,
  toJS
}
