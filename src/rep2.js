'use strict'

const fs = require('fs')
const path = require('path')

const chalk = require('chalk')
const ebnf = require('ebnf')
const im = require('immutable')

// Utils
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
  string: ast => ast.text,
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

// Expanding
// Enacting
// Printing

const printChildren = (exp, n, sep = ' ') => {
  return exp
    .slice(n)
    .map((_, i) => printChild(exp, n + i))
    .join(sep)
}

const printChild = (parentExp, i) => {
  const childExp = parentExp.get(i)
  return get(printRules, getType(childExp), x => x)(childExp)
}

const printRules = {
  comment: x => chalk.dim.strikethrough('#' + printChildren(x, 1)),
  bind: x => printChildren(x, 1, chalk.cyan(':')),
  list: x => chalk.cyan('(') + printChildren(x, 0) + chalk.cyan(')'),
  set: x => (
    chalk.cyan('{') +
    printChildren(x.entrySeq().map(([k, v]) =>
      im.is(k, v) ? v : makeBind(k, v)), 0) +
    chalk.cyan('}')),
  expand: x => chalk.cyan('$') + printChildren(x, 1),
  quote: x => chalk.cyan('\\') + printChildren(x, 1),
  boolean: chalk.yellow,
  number: chalk.yellow,
  string: chalk.green,
  symbol: x => (x.name in symbols ? chalk.blue.bold : chalk.blue)(x.name),
  undefined: chalk.yellow,
  object: chalk.yellow
}

const print = x => {
  return printChild(makeList(x), 0)
}

// General

const read = str =>
  form(parse(str))

const rep = str => {
  try {
    return read(str).map(print)
  } catch (e) {
    console.dir(e)
    return `"${e.message}"`
  }
  /*
  try {
    const exps = read(str)
    state = exps.reduce(
      (state, exp) => {
        const val = eval2(frm.bind(env.get('expTotal'), exp), state.env)
        return state
          .update('env', env =>
            updateEnv(env, val)
              .update('expTotal', x => x + 1))
          .update('vals', vals => vals.push(val))
      },
      state.set('vals', im.List()))
    return state.get('vals').map(print)
  } catch (e) {
    console.dir(e)
    return print(list(bind(sym('error'), `"${e.message}"`)))
  }
  */
}

module.exports = {
  // parse,
  // form,
  // expand,
  // enact,

  // read,
  // eval2,
  // print,

  rep
}
