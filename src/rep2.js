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

const makeList = (...xs) => im.List(xs)
// const makeSet = (...xs) => im.Map(xs)
const makeBind = (k, v) => makeList(sym('bind'), k, v)
// const makeExpand = x => makeList(sym('expand'), x)

const isSym = x => x instanceof Sym
const isList = x => im.List.isList(x)
const isSet = x => im.Map.isMap(x)
const isForm = (x, ...names) =>
  isList(x) && names.some(name => im.is(x.first(), sym(name)))

const getType = x =>
  isSet(x)
    ? 'set'
    : isSym(x)
      ? 'symbol'
      : isList(x)
        ? 'list'
        : typeof x

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

const evalList = (exp, env) =>
  exp.rest().map(x => evalSymCallAtom(x, env))

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

const destructBind = exp =>
  isForm(exp, 'bind', 'spread')
    ? isForm(exp.get(1), 'list')
      ? exp
        .get(1)
        .rest()
        .map((exp, i) => destructBind(rebind(exp, k => makeBind(k, i))))
        .unshift(sym('binds'))
        .push(destructBind(exp.last()))
      : exp.update(-1, destructBind)
    : exp

const evalBind = (exp, env) =>
  makeBind(
    evalCallAtom(exp.get(1), env),
    evalSymCallAtom(exp.get(2), env))

const evalSpread = (exp, env) =>
  exp.update(1, x => evalCallAtom(x, env))

const evalBinds = (exp, env) =>
  makeList(sym('binds'))
    .concat(exp.rest().map(exp => evalSymCallAtom(exp, env)))

const evalExpand = (exp, env) =>
  getEnv(env, evalCallAtom(exp.get(1), env))

const evalQuote = (exp, env) =>
  exp.get(1)

const evalEval = (exp, env) =>
  evalSymCallAtom(evalSymCallAtom(exp.get(1), env), env)

const evalEval2 = (exp, env) =>
  evalCallAtom(evalSymCallAtom(exp.get(1), env), env)

const evalAtom = (exp, env) =>
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
    chalk.cyan('(') +
    printChildren(x, r) +
    chalk.cyan(')'),
  set: (x, r) =>
    chalk.cyan('{') +
    printChildren(
      x.entrySeq().map(([k, v]) => im.is(k, v) ? v : makeBind(k, v)),
      r) +
    chalk.cyan('}'),
  symbol: (x, r) => (x.name in syms ? chalk.blue.bold : chalk.blue)(x.name),
  string: (x, r) => chalk.green(`"${x}"`),
  boolean: (x, r) => chalk.yellow(x),
  number: (x, r) => chalk.yellow(x),
  undefined: (x, r) => chalk.yellow(x),
  object: (x, r) => chalk.yellow(x),
  function: (x, r) => chalk.yellow(`<${x.name}>`),

  // For now, these forms are just printed as lists
  comment: (x, r) => chalk.dim.strikethrough('#' + printChildren(x.rest(), r)),
  bind: (x, r) => printChildren(x.rest(), r, chalk.cyan(': ')),
  expand: (x, r) => chalk.cyan('$') + printChildren(x.rest()),
  quote: (x, r) => chalk.cyan('\\') + printChildren(x.rest())
}

const printBind = (x, r = printRules) =>
  r.bind(x, r)

const printChildren = (x, rules, sep = ' ') =>
  x.map(child => print(child, rules)).join(sep)

const print = (x, r = printRules) =>
  get(r, getType(x), x => x)(x, r)

// General

const read = str =>
  form(parse(str))

const unchainBind = (exp, bnds = makeList()) =>
  isForm(exp, 'bind', 'binds')
    ? unchainBind(exp.last(), bnds.push(exp))
    : bnds.map(x => x.set(-1, exp))

const applyBind = (m, exp) =>
  isForm(exp, 'bind', 'binds')
    ? isForm(exp.last(), 'bind', 'binds')
      ? unchainBind(exp).reduce(applyBind, m)
      : isForm(exp, 'bind')
        ? m.set(exp.get(1), exp.get(2))
        : exp
          .slice(1, -1)
          .map(x => rebind(x, isForm(x, 'spread')
            ? k => exp.last().slice(k)
            : k => exp.last().get(k)))
          .reduce(applyBind, m)
    : isForm(exp, 'spread')
      ? applyBind(m, exp.last())
      : m

let env = im.Map([
  [sym('read'), str => read(str).first()],
  [sym('bind'), special(evalBind)],
  [sym('binds'), special(evalBinds)],
  [sym('expand'), special(evalExpand)],
  [sym('quote'), special(evalQuote)],
  [sym('spread'), special(evalSpread)],

  [sym('eval'), special(evalEval)],
  [sym('eval2'), special(evalEval2)],

  [sym('list'), special(evalList)],

  [sym('+'), (...xs) => xs.reduce((t, x) => t + x, 0)],
  ['expTotal', 1]
])

const rep = str => {
  try {
    env = read(str)
      .reduce(
        (env, exp) => {
          const val = evalSymCallAtom(
            makeBind(env.get('expTotal'), destructBind(exp)),
            env.set('evalForm', exp))
          return applyBind(env,
            dbg('applyingBind',
              print(makeBind(sym('_'), val)),
              makeBind(sym('_'), val)))
            .update('expTotal', x => x + 1)
            .update('vals', x => x.push(val))
        },
        env.set('vals', im.List()))
    return env.get('vals').map(val => printBind(val))
  } catch (e) {
    console.dir(e)
    return im.List([])
  }
}

module.exports = {
  dbg,
  rep
}
