'use strict'

const fs = require('fs')
const path = require('path')

const chalk = require('chalk')
const ebnf = require('ebnf')
const im = require('immutable')

// Utils

const dbg = (msg, ...vals) => {
  const ret = vals.pop()
  console.debug(msg, ...vals)
  return ret
}

const get = (o, k, d) =>
  k in o ? o[k] : d

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

const makeBind = (k, v) =>
  makeList(sym('bind'), k, v)

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

const is = (x, y) =>
  getType(x) === getType(y) && im.is(x, y)

const isForm = (x, ...names) =>
  isList(x) && names.some(name => is(x.first(), sym(name)))

const emptyList = makeList()
const emptySet = makeSet()

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
  form(ast.children[0])
const formSymList = (name, formFn) =>
  ast =>
    makeList(sym(name), ...(formFn(ast) || []))

const formRules = {
  forms: formChildren,
  form1: formChild,
  form2: formChild,
  form3: formChild,
  form4: formChild,

  comment: formSymList('comment', formChildren),
  bind: formSymList('bind', formChildren),
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

const rebind = (exp, fn) =>
  isForm(exp, 'bind', 'binds', 'spread')
    ? exp.update(-1, x => rebind(x, fn))
    : fn(exp)

const unbind = (exp) =>
  isForm(exp, 'bind', 'binds')
    ? unbind(exp.last())
    : isForm(exp, 'spread')
      ? exp.update(-1, unbind)
      : exp

const destructBind = (exp, fn) =>
  exp
    .get(1)
    .rest()
    .map(fn)
    .unshift(sym('binds'))
    .push(destruct(exp.last()))

const destruct = exp =>
  isForm(exp, 'bind', 'spread')
    ? isForm(exp.get(1), 'list')
      ? destructBind(exp, (x, i) => destruct(rebind(x, k => makeBind(k, i))))
      : isForm(exp.get(1), 'set')
        ? destructBind(exp, destruct)
        : exp.update(-1, destruct)
    : exp

const unchainBind = (exp, bnds = makeList()) =>
  isForm(exp, 'bind', 'binds')
    ? unchainBind(exp.last(), bnds.push(exp))
    : bnds.map(x => x.set(-1, exp))

const applyBind = (set, exp) =>
  isForm(exp, 'bind', 'binds')
    ? isForm(exp.last(), 'bind', 'binds')
      ? unchainBind(exp).reduce(applyBind, set)
      : isForm(exp, 'bind')
        ? conj(set, exp)
        : exp
          .slice(1, -1)
          .map(x => isForm(x, 'bind', 'binds', 'spread')
            ? x
            : makeBind(x, x))
          .map(x => rebind(x, isForm(x, 'spread')
            ? k => exp.last().slice(k)
            : k => exp.last().get(k)))
          .reduce(applyBind, set)
    : isForm(exp, 'spread')
      ? applyBind(set, exp.last())
      : conj(set, exp)

const evalSpread = (exp, env) =>
  exp.update(1, x => evalCallAtom(x, env))

const evalBinds = (exp, env) =>
  exp
    .rest()
    .map(x => evalCallAtom(x, env))
    .unshift(exp.first())

const evalBind = (exp, env) =>
  exp
    .update(1, x => evalCallAtom(x, env))
    .update(2, x => evalSymCallAtom(x, env))

const evalExpand = (exp, env) =>
  getEnv(env, evalCallAtom(exp.get(1), env))

const evalQuote = (exp, _env) =>
  exp.get(1)

const evalConj = (exp, env) => {
  const target = evalSymCallAtom(exp.get(1), env)

  if (!(isList(target) || isSet(target))) {
    throw new Error(`Unable to conj onto the ${getType(target)} ${print(target)}`)
  }

  const handleBind = isList(target)
    ? (x, i) => rebind(unbind(x), y => makeBind(i, y))
    : destruct

  return exp
    .slice(2)
    .map(x => dbg('initial exp:', print(x), x))
    .map(handleBind)
    .map(x => dbg('after handleBind:', print(x), x))
    .map(x => evalSymCallAtom(x, env))
    .map(x => dbg('after evalSymCallAtom:', print(x), x))
    .reduce(applyBind, target)
}

const evalList = (exp, env) =>
  exp.rest().map(x => evalSymCallAtom(x, env))
/*
  evalConj(
    makeList(sym('conj'), sym('emptyList'))
      .concat(exp.rest()))
*/

const conj = (m, x) =>
  isForm(x, 'bind')
    ? m.set(x.get(1), x.get(2))
    : m.set(x, x)

const evalSet = (exp, env) =>
  exp
    .rest()
    .map(x => evalSymCallAtom(x, env))
    .reduce(conj, emptySet)
/*
  evalConj(
    makeList(sym('conj'), sym('emptySet'))
      .concat(exp.rest()))
*/

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

const applyExp = (env, exp) => {
  const val = evalSymCallAtom(
    makeBind(env.get('expTotal'), destruct(exp)),
    env.set('evalForm', exp))
  return applyBind(env, makeBind(sym('_'), val))
    .update('expTotal', x => x + 1)
    .update('vals', x => x.push(val))
}

// Printing
const printRules = {
  list: (x, r) =>
    chalk.cyan('[') +
    printChildren(x, r) +
    chalk.cyan(']'),
  set: (x, r) =>
    chalk.cyan('{') +
    printChildren(
      x.map((v, k) => is(k, v) ? v : makeBind(k, v)),
      r) +
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
  bind: (x, r) => printChildren(x.rest(), r, chalk.cyan(': ')),
  expand: x => chalk.cyan('$') + printChildren(x.rest()),
  quote: x => chalk.cyan('\\') + printChildren(x.rest())
}

const printBind = (x, r = printRules) =>
  r.bind(x, r)

const printChildren = (x, rules, sep = ' ') =>
  x.map(child => print(child, rules)).join(sep)

const print = (x, r = printRules) =>
  get(r, getType(x), x => x)(x, r)

// General

const initialEnv = makeSet(
  [sym('read'), str => read(str).first()],
  [sym('bind'), special(evalBind)],
  [sym('binds'), special(evalBinds)],
  [sym('expand'), special(evalExpand)],
  [sym('quote'), special(evalQuote)],
  [sym('spread'), special(evalSpread)],

  [sym('eval'), special(evalEval)],
  [sym('eval2'), special(evalEval2)],

  [sym('conj'), special(evalConj)],
  [sym('list'), special(evalList)],
  [sym('set'), special(evalSet)],

  [sym('emptyList'), emptyList],
  [sym('emptySet'), emptySet],
  [sym('+'), (...xs) => xs.reduce((t, x) => t + x, 0)],
  ['expTotal', 1])

let env = initialEnv

const read = str =>
  form(parse(str))

const readEval = (env, str) =>
  read(str)
    .reduce(applyExp, env.set('vals', emptyList))

const rep = str => {
  try {
    env = readEval(env, str)
    return env.get('vals').map(val => printBind(val))
  } catch (e) {
    console.dir(e)
    return emptyList
  }
}

module.exports = {
  dbg,
  emptyList,
  emptySet,
  initialEnv,
  makeList,
  makeSet,
  makeSym,
  read,
  readEval,
  rep,
  sym
}
