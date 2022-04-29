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

const syms = {}
const sym = name => {
  if (!(name in syms)) {
    syms[name] = makeSym(name)
  }
  return syms[name]
}

const makeList = (...xs) => im.List(xs)
// const makeSet = (...xs) => im.Map(xs)
const makeBind = (k, v) => makeList(sym('bind'), k, v)
// const makeExpand = x => makeList(sym('expand'), x)

const isSym = x => x instanceof Sym
const isList = x => im.List.isList(x)
const isSet = x => im.Map.isMap(x)
const isBindList = x => x.first() === sym('bind')
// const isColl = x => isList(x) || isSet(x)

const getType = x =>
  isSet(x)
    ? 'set'
    : isSym(x)
      ? 'sym'
      : isList(x)
        ? isBindList(x)
          ? 'bind'
          : 'list'
        : typeof x

// Parsing

const lsnParser = new ebnf.Grammars.W3C.Parser(
  fs.readFileSync(path.resolve(__dirname, 'lsn.ebnf.w3c'))
    .toString())

const parse = str => {
  const ast = lsnParser.getAST(str)

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
  round: formChild,
  square: formSymList('list', formChild),
  curly: formSymList('set', formChild),
  complement: formSymList('complement', formChildren),

  number: ast => parseFloat(ast.text),
  string: ast => ast.text.substr(1, ast.text.length - 2),
  boolean: ast => ast.text === 'true',
  null: ast => null,
  undefined: ast => undefined,
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
  im.is(exp, sym('env'))
    ? env
    : env.get(exp)

const special = fn => {
  fn.special = true
  return fn
}

const isSpecial = (fn) => 'special' in fn

const evalFn = (exp, env) => {
  const fn = evalSymListAtom(exp, env)
  if (typeof fn !== 'function') {
    throw new Error(`${printLists(env.get('evalForm'))}
       ^ ${printLists(exp)} is ${fn} and not callable.`)
  }
  return isSpecial(fn)
    ? fn
    : (exp, env) =>
        fn(...exp
          .rest()
          .map(exp => evalSymListAtom(exp, env))
          .toArray())
}

const evalBind = (exp, env) =>
  makeBind(
    evalListAtom(exp.get(1), env),
    evalSymListAtom(exp.get(2), env))

const evalExpand = (exp, env) =>
  getEnv(env, evalListAtom(exp.get(1), env))

const evalQuote = (exp, env) =>
  exp.get(1)

const evalAtom = (exp, env) =>
  exp // atoms always eval to themselves (even syms!)

const evalList = (exp, env) =>
  evalFn(exp.first(), env)(exp, env)

const evalSym = (exp, env) =>
  getEnv(env, exp)

const evalListAtom = (exp, env) =>
  isList(exp)
    ? evalList(exp, env)
    : evalAtom(exp, env)

const evalSymListAtom = (exp, env) =>
  isSym(exp)
    ? evalSym(exp, env)
    : evalListAtom(exp, env)

// Printing
const printRules = {
  comment: (x, r) => chalk.dim.strikethrough('#' + printChildren(x.rest(), r)),
  bind: (x, r) => printChildren(x.rest(), r, chalk.cyan(':')),
  list: (x, r) =>
    chalk.cyan('(') +
    printChildren(x, r) +
    chalk.cyan(')'),
  set: (x, r) =>
    chalk.cyan('{') +
    printChildren(
      x.entrySeq().map(([k, v]) => im.is(k, v) ? v : makeBind(k, v)),
      r) +
    chalk.cyan('}'),
  expand: (x, r) => chalk.cyan('$') + printChildren(x.rest()),
  quote: (x, r) => chalk.cyan('\\') + printChildren(x.rest()),
  sym: (x, r) => (x.name in syms ? chalk.blue.bold : chalk.blue)(x.name),
  string: (x, r) => chalk.green(x),
  boolean: (x, r) => chalk.yellow(x),
  number: (x, r) => chalk.yellow(x),
  undefined: (x, r) => chalk.yellow(x),
  object: (x, r) => chalk.yellow(x)
}

const listPrintRules = {
  ...printRules,

  bind: printRules.list,
  comment: printRules.list,
  expand: printRules.list,
  quote: printRules.list
}

const printChildren = (x, rules, sep = ' ') =>
  x.map(child => print(child, rules)).join(sep)

const print = (x, rules = printRules) =>
  get(rules, getType(x), x => x)(x, rules)

const printLists = x =>
  print(x, listPrintRules)

// General

const read = str =>
  form(parse(str))

const bindVals = (env, exp) =>
  env

let env = im.Map([
  [sym('env'), undefined], // This is a meta reference

  [sym('bind'), special(evalBind)],
  [sym('expand'), special(evalExpand)],
  [sym('quote'), special(evalQuote)],
  [sym('eval'), special((exp, env) =>
    evalSymListAtom(evalSymListAtom(exp.get(1), env), env))],
  [sym('eval2'), special((exp, env) =>
    evalListAtom(evalSymListAtom(exp.get(1), env), env))],
  [sym('+'), (...args) => args.reduce((sum, x) => sum + x, 0)],
  ['expTotal', 1]
])

const rep = str => {
  try {
    env = read(str)
      .reduce(
        (env, exp) => {
          const val = evalSymListAtom(
            makeBind(env.get('expTotal'), exp),
            env.set('evalForm', exp))
          return bindVals(env, val)
            .update('expTotal', x => x + 1)
            .update('vals', x => x.push(val))
        },
        env.set('vals', im.List()))
    return env.get('vals').map(val => print(val))
  } catch (e) {
    console.dir(e)
    return im.List([])
  }
}

module.exports = {
  dbg,
  rep
}
