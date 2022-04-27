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
const Symbol2 = im.Record({ name: null }, 'Symbol2')
const makeSymbol = name => Symbol2({ name })

const symbols = {}
const sym = name => {
  if (!(name in symbols)) {
    symbols[name] = makeSymbol(name)
  }
  return symbols[name]
}

const makeList = (...xs) => im.List(xs)
// const makeSet = (...xs) => im.Map(xs)
const makeBind = (k, v) => makeList(sym('bind'), k, v)
// const makeExpand = x => makeList(sym('expand'), x)

const isSymbol = x => x instanceof Symbol2
const isList = x => im.List.isList(x)
const isSet = x => im.Map.isMap(x)
const isBindList = x => x.first() === sym('bind')
// const isColl = x => isList(x) || isSet(x)

const getType = x =>
  isSet(x)
    ? 'set'
    : isSymbol(x)
      ? 'symbol'
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
  symbol: ast => symbols[ast.text] || makeSymbol(ast.text)
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

const evalBind = (exp, env) =>
  makeBind(
    evalListAtom(exp.get(1), env),
    evalSymListAtom(exp.get(2), env))

const evalExpand = (exp, env) =>
  getEnv(env, evalListAtom(exp.get(1), env))

const call = (exp, env) => {
  try {
    const fn = evalSymListAtom(exp.first(), env)
    if (typeof fn !== 'function') {
      throw new Error(`${print(exp.first())} is ${fn}`)
    }
    return fn(exp, env)
  } catch (e) {
    e.message = `${printLists(exp)}\n       ${e.message}`
    throw e
  }
}

const evalAtom = (exp, env) =>
  exp // atoms always eval to themselves

const evalListAtom = (exp, env) =>
  isList(exp)
    ? call(exp, env)
    : evalAtom(exp, env)

const evalSymListAtom = (exp, env) =>
  isSymbol(exp)
    ? getEnv(env, exp)
    : evalListAtom(exp, env)

const evaluate = (exp, env) =>
  evalSymListAtom(exp, env)

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
  symbol: (x, r) => (x.name in symbols ? chalk.blue.bold : chalk.blue)(x.name),
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
  [sym('bind'), evalBind],
  [sym('expand'), evalExpand],
  [sym('env'), sym('env')],
  ['expTotal', 1]
])

const rep = str => {
  try {
    env = read(str)
      .reduce(
        (env, exp) => {
          const val = evaluate(makeBind(env.get('expTotal'), exp), env)
          return bindVals(env, val)
            .update('expTotal', x => x + 1)
            .update('vals', x => x.push(val))
        },
        env.set('vals', im.List()))
    return env.get('vals').map(val => print(val))
  } catch (e) {
    console.dir(e)
    return im.List([`"${e.message}"`])
  }
}

module.exports = {
  // parse,
  // form,
  // expand,
  // enact,

  // read,
  // eval2,
  // print,

  dbg,
  rep
}
