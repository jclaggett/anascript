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

const is = (x, y) =>
  getType(x) === getType(y) && im.is(x, y)

const isForm = (x, ...names) =>
  isList(x) && names.some(name => is(x.first(), sym(name)))

const makeForm = (name, ...args) =>
  makeList(sym(name), ...args)

const makeBind = (k, v) =>
  makeForm('bind', k, v)

const makeQuote = x =>
  makeForm('quote', x)

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
  isForm(exp, 'bind')
    ? exp.update(-1, x => rebind(x, fn))
    : fn(exp)

const applyBindList = (col, exp) =>
  getType(exp) === 'list'
    ? exp
      .filter(x => isForm(x, 'bind'))
      .reduce((col, bind) => col.set(bind.get(1), bind.get(2)), col)
    : col

const evalSpread = (exp, env) =>
  exp.update(1, x => evalCallAtom(x, env))

const unchainBindExp = exp =>
  isForm(exp, 'bind')
    ? unchainBindExp(exp.get(2)).insert(1, exp.get(1))
    : makeList(exp)

const asBind = exp =>
  isForm(exp, 'bind')
    ? exp
    : makeBind(exp, exp)

const getBindKey = exp =>
  isForm(exp, 'bind')
    ? getBindKey(exp.get(2))
    : exp

const evalBindLabelListList = (exp, env, val) =>
  exp
    .rest()
    .flatMap((x, i) =>
      evalBind2(isForm(x, 'spread')
        ? rebind(x.get(1), y =>
          makeBind(y, makeQuote(val.slice(i))))
        : rebind(x, y =>
          makeBind(y, makeQuote(val.get(i)))),
      env))

const evalBindLabelListSet = (exp, env, val) =>
  exp
    .rest()
    .flatMap((x, i) =>
      evalBind2(isForm(x, 'spread')
        ? rebind(x.get(1), y =>
          makeBind(y, makeQuote(val.deleteAll(im.Range(0, i)))))
        : rebind(x, y =>
          makeBind(y, makeQuote(val.get(i)))),
      env))

const evalBindLabelSetList = (exp, env, val) =>
  exp
    .rest()
    .reduce((r, x) => {
      const key = isForm(x, 'spread')
        ? undefined
        : evalCallAtom(getBindKey(x), env)
      return r
        .update('binds', y =>
          y.concat(
            evalBind2(isForm(x, 'spread')
              ? rebind(x.get(1), z =>
                makeBind(z, makeQuote(val.slice(r.get('maxKey') + 1))))
              : rebind(asBind(x), _ =>
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
        : evalCallAtom(getBindKey(x), env)
      return r
        .update('binds', y =>
          y.concat(
            evalBind2(isForm(x, 'spread')
              ? rebind(x.get(1), z =>
                makeBind(z, makeQuote(val.deleteAll(r.get('keysTaken')))))
              : rebind(asBind(x), _ =>
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

const evalBind2 = (exp, env) => {
  const exps = unchainBindExp(exp)
  const val = evalSymCallAtom(exps.first(), env)
  return exps
    .rest()
    .flatMap(label => evalBindLabel(label, env, val))
}

const evalExpand = (exp, env) =>
  getEnv(env, evalCallAtom(exp.get(1), env))

const evalQuote = (exp, _env) =>
  exp.get(1)

const evalConj = (exp, _env) =>
  exp

const evalList = (exp, env) =>
  exp.rest().map(x => evalSymCallAtom(x, env))

const conj = (m, x) =>
  isForm(x, 'bind')
    ? m.set(x.get(1), x.get(2))
    : getType(x, 'list') && isForm(x.first(), 'bind')
      ? x.reduce(conj, m)
      : m.set(x, x)

const evalSet = (exp, env) =>
  exp
    .rest()
    .map(x => evalSymCallAtom(x, env))
    .reduce(conj, emptySet)

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
  const val2 = evalSymCallAtom(
    makeBind(
      sym('_'),
      makeBind(
        getEnv(env, 'expTotal'),
        exp)),
    env.set('evalForm', exp))
  return applyBindList(env, val2)
    .update('expTotal', x => x + 1)
    .update('vals', x => x.push(val2))
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
  [sym('bind'), special(evalBind2)],
  [sym('expand'), special(evalExpand)],
  [sym('quote'), special(evalQuote)],
  [sym('spread'), special(evalSpread)],

  [sym('expandBind'), special((exp, env) => evalBind2(exp.get(1), env))],

  [sym('eval'), special(evalEval)],
  [sym('eval2'), special(evalEval2)],

  [sym('conj'), special(evalConj)],
  [sym('list'), special(evalList)],
  [sym('set'), special(evalSet)],

  [sym('emptyList'), emptyList],
  [sym('emptySet'), emptySet],
  [sym('+'), (...xs) => xs.reduce((t, x) => t + x, 0)],
  ['expTotal', 1])

const read = str =>
  form(parse(str))

const readEval = (env, str) =>
  read(str)
    .reduce(applyExp, env.set('vals', emptyList))

let env = initialEnv
const readEvalPrint = str => {
  try {
    env = readEval(env, str)
    return getEnv(env, 'vals').map(val => printBind(val))
  } catch (e) {
    console.dir(e)
    return emptyList
  }
}

const rep = readEvalPrint

const getCurrentEnv = x =>
  getEnv(env, x)

module.exports = {
  dbg,
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
