'use strict'

const fs = require('fs')
const path = require('path')

const chalk = require('chalk')
const ebnf = require('ebnf')
const im = require('immutable')

// Utils

const getDefault = (o, k, d) =>
  k in o ? o[k] : d

const throwError = msg => {
  throw new Error(msg)
}

// Language primitives
const Sym = im.Record({ name: null }, 'Sym')
const makeSym = name => Sym({ name })

const syms = { env: makeSym('env') }
const sym = name => {
  if (!(name in syms)) {
    syms[name] = makeSym(name)
  }
  return syms[name]
}

const makeList = (...xs) =>
  im.List(xs)

const makeSet = (...xs) =>
  im.Map(xs)

const isSym = x => x instanceof Sym
const isList = x => im.List.isList(x)
const isSet = x => im.Map.isMap(x)

const getType = x =>
  isSet(x)
    ? 'set'
    : isSym(x)
      ? 'symbol'
      : isList(x)
        ? 'list'
        : typeof x

const isType = (x, t) =>
  getType(x) === t

const is = (x, y) =>
  getType(x) === getType(y) && im.is(x, y)

const isForm = (x, ...names) =>
  isList(x) && names.some(name => is(x.first(), sym(name)))

const makeForm = (name, ...args) =>
  makeList(sym(name), ...args)

const makeBind = (k, v) =>
  makeForm('bind', k, v)

const makeLabel = (k, v) =>
  makeForm('label', k, v)

const makeQuote = x =>
  makeForm('quote', x)

const emptyList = makeList()
const emptySet = makeSet()

const conjReducer = fn => {
  const reducer = (col, x) =>
    isForm(x, 'bind')
      ? col.set(x.get(1), x.get(2))
      : isForm(x, 'binds')
        ? x.rest().reduce(reducer, col)
        : isForm(x, 'spread')
          ? isType(x.get(1), 'list')
            ? x.get(1)
              .reduce(reducer, col)
            : x.get(1)
              .map((v, k) => makeBind(k, v))
              .reduce(reducer, col)
          : fn(col, x)
  return reducer
}

const conjReducerList = conjReducer((col, x) => col.push(x))
const conjReducerSet = conjReducer((col, x) => col.set(x, x))

const conj = (col, ...xs) =>
  xs.reduce(isType(col, 'list')
    ? conjReducerList
    : isType(col, 'set')
      ? conjReducerSet
      : throwError(`Unable to conj onto type ${getType(col)}. Must be type set or list`),
  col)

const get = (col, k, d) =>
  isType(col, 'list') || isType(col, 'set')
    ? col.get(k, d)
    : throwError(`Unable to get from type ${getType(col)}. Must be type set or list`)

// Parsing

const lsnParser = new ebnf.Grammars.W3C.Parser(
  fs.readFileSync(path.resolve(__dirname, 'lsn.ebnf.w3c'))
    .toString())

const parse = str => {
  const ast = lsnParser.getAST(str + ' ')

  if (!ast) {
    throw new Error('Failed to parse input')
  }

  return ast
}

// Forming

const formChildren = ast =>
  makeList(...ast.children.map(form))
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

const isSpecial = (fn) =>
  'special' in fn

const evalFn = (exp, env) => {
  const fn = evalSymCallAtom(exp, env)
  if (typeof fn !== 'function') {
    throw new Error(`${print(env.get('evalForm'))}
       ^ ${print(exp)} is ${fn} and not callable.`)
  }
  return isSpecial(fn)
    ? fn
    : (exp, env) =>
        fn(...exp
          .rest()
          .map(exp => evalSymCallAtom(exp, env))
          .toArray())
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
                  : emptySet)))
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

const evalEval = (exp, env) =>
  evalSymCallAtom(evalSymCallAtom(exp.get(1), env), env)

const evalEval2 = (exp, env) =>
  evalCallAtom(evalSymCallAtom(exp.get(1), env), env)

const evalAtom = (exp, _env) =>
  exp // atoms always eval to themselves (even syms!)

const evalCall = (exp, env) =>
  evalFn(exp.first(), env)(exp, env)

const evalSym = (exp, env) =>
  getEnv(env, exp)

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
    chalk.cyan('[') +
    printChildren(x, r) +
    chalk.cyan(']'),
  set: (x, r) =>
    chalk.cyan('{') +
    x.map((v, k) =>
      is(k, v)
        ? print(k, r)
        : printLabel(makeLabel(k, v), r))
      .join(' ') +
    chalk.cyan('}'),
  symbol: x => (x.name in syms ? chalk.blue.bold : chalk.blue)(x.name),
  string: x => chalk.green(`"${x}"`),
  boolean: x => chalk.yellow(x),
  number: x => chalk.yellow(x),
  undefined: x => chalk.yellow(x),
  object: x => chalk.yellow(x),
  function: x => chalk.yellow(`<${x.name}>`),

  // For now, these forms are just printed as lists
  comment: (x, r) => chalk.dim.strikethrough('#' + printChildren(x.rest(), r)),
  label: (x, r) => printChildren(x.rest(), r, chalk.cyan(': ')),
  expand: x => chalk.cyan('$') + printChildren(x.rest()),
  quote: x => chalk.cyan('\\') + printChildren(x.rest())
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
    .reduce(applyExp, env.set('vals', emptyList))

const readEvalPrint = str => {
  try {
    env = readEval(env, str)
    return getEnv(env, 'vals').map(val => printLabel(val.get(2)))
  } catch (e) {
    console.dir(e)
    return emptyList
  }
}

const rep = readEvalPrint

const initialEnv = makeSet(
  [sym('read'), str => read(str).first()],
  [sym('label'), special(evalLabel)],
  [sym('expand'), special(evalExpand)],
  [sym('quote'), special(evalQuote)],
  [sym('spread'), special(evalSpread)],

  [sym('eval'), special(evalEval)],
  [sym('eval2'), special(evalEval2)],

  [sym('list'), (...xs) => conj(emptyList, ...xs)],
  [sym('set'), (...xs) => conj(emptySet, ...xs)],

  [sym('emptyList'), emptyList],
  [sym('emptySet'), emptySet],
  [sym('+'), (...xs) => xs.reduce((t, x) => t + x, 0)],
  [sym('-'), (...xs) => xs.reduce((t, x) => t - x, 0)],
  [sym('conj'), conj],
  [sym('get'), get],
  ['expTotal', 1])
let env = initialEnv

const getCurrentEnv = x =>
  getEnv(env, x)

module.exports = {
  emptyList,
  emptySet,
  form,
  getCurrentEnv,
  initialEnv,
  is,
  makeList,
  makeSet,
  makeSym,
  parse,
  print,
  read,
  readEval,
  readEvalPrint,
  rep,
  sym
}
