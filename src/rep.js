'use strict'

const fs = require('fs')
const path = require('path')

const im = require('immutable')
const chalk = require('chalk')

const ebnf = require('ebnf')

const lsnParser = new ebnf.Grammars.W3C.Parser(fs.readFileSync(path.resolve(__dirname, 'lsn.ebnf.w3c')).toString())

const Symbol2 = im.Record({ sym: null }, 'Symbol2')
const symbol = sym => Symbol2({ sym })
const sym = Object.fromEntries([
  'activeEval',
  'bind',
  'comment',
  'complement',
  'do',
  'error',
  'eval',
  'expand',
  'list',
  'quote',
  'set',
  '_'
].map(x => [x, symbol(x)]))
const specials = sym

const getMeta = x => x[Symbol.for('metadata')] || im.Map()
const setMeta = (x, m) => {
  x[Symbol.for('metadata')] = im.Map(m)
  return x
}

const isSymbol = x => x instanceof Symbol2
const isList = x => im.List.isList(x)
const isCall = (x) => isList(x) && getMeta(x).get('call', false)
const isBind = (x) => isList(x) && getMeta(x).get('bind', false)
const isCallable = x => x instanceof Function

const list = xs => im.List(xs)
const call = xs => setMeta(im.List(xs), { call: true })
const bind = (k, v) => setMeta(im.List([k, v]), { bind: true })

//
// Read Section
//

function walkAST (ast, rules) {
  if (!(ast.type in rules)) {
    throw new Error(`Unknown AST Type: ${ast.type}`)
  }
  return rules[ast.type](ast, rules)
}

const children = (ast, rules) => call(ast.children.map(child => walkAST(child, rules)))
const child = (ast, rules) => children(ast, rules).first()
const sexpr = (type, f) => (ast, rules) => call([type, ...(f(ast, rules) || [])])

const readRules = {
  forms: children,
  form1: child,
  form2: child,
  form3: child,
  form4: child,

  comment: sexpr(specials.comment, children),
  bind: sexpr(specials.bind, children),
  expand: sexpr(specials.expand, children),
  quote: sexpr(specials.quote, children),
  round: child,
  square: sexpr(specials.list, child),
  curly: sexpr(specials.set, child),
  complement: sexpr(specials.complement, children),

  number: ast => parseFloat(ast.text),
  string: ast => ast.text,
  boolean: ast => ast.text === 'true',
  null: ast => null,
  undefined: ast => undefined,
  symbol: ast => specials[ast.text] || symbol(ast.text)
}

function read (str) {
  const ast = lsnParser.getAST(str)

  if (!ast) {
    throw new Error('Failed to parse input')
  }

  return walkAST(ast, readRules)
}

//
// Evaluation Section
//

function evalList (exp, env) {
  const val = list(exp
    .slice(1)
    .map(item => env.get(specials.activeEval)(item, env)))
  return val
}

function evalBind (exp, env) {
  return bind(
    evalExp(exp.get(1), env.set(specials.activeEval, evalExp)),
    env.get(specials.activeEval)(exp.get(2), env))
}

function evalExpand (exp, env) {
  return env.get(evalExp(exp.get(1), env))
}

function evalQuote (exp, env) {
  // new plan: define a new env that only evals a few specific calls and eval
  // exp. Question: what about symbols? eh. hope we get lucky.
  env = env.set(specials.activeEval, evalExp)
  return evalExp(exp.get(1), {
    get: k => {
      const v = env.get(k)
      if (isCallable(v)) {
        if (!env.get('unquotedForms').has(k)) {
          return (exp, env) => exp
        }
      }
      return v
    }
  })
}

function evalExp (exp, env) {
  let val = exp
  if (isCall(exp)) {
    const callable = evalSymExp(exp.first(), env)
    if (isCallable(callable)) {
      val = callable(exp, env)
    } else {
      throw new Error(`Not callable: ${exp.first()} (${callable})`)
    }
  }
  return val
}

function evalSymExp (exp, env) {
  if (isSymbol(exp)) {
    return env.get(exp)
  } else {
    return evalExp(exp, env)
  }
}

function updateBindEnv (env, val) {
  const lhs = val.get(0)
  const rhs = val.get(1)
  if (isBind(rhs)) {
    env = updateBindEnv(env, rhs)
    return env.set(lhs, env.get(rhs.get(0)))
  } else {
    return env.set(lhs, rhs)
  }
}

function updateEnv (env, val) {
  return updateBindEnv(env, bind(specials._, val))
}

function evalDo (exp, env) {
  return exp
    .slice(1)
    .reduce((env, form) =>
      updateEnv(env, evalSymExp(form, env)), env)
    .get(symbol('_'))
}

function evalBody (state, exp) {
  const val = evalSymExp(exp, state.env)
  return state
    .update('vals', vals => vals.push(val))
    .update('env', env => {
      env = env.update('expTotal', expTotal => expTotal + 1)
      return updateEnv(env, bind(env.get('expTotal'), val))
    })
}

function evaluate (state, exps) {
  return exps
    .reduce(evalBody, state.set('vals', im.List()))
    .set('exps', exps)
    .update('expTotal', n => n + exps.count())
}

//
// Print Section
//

function printChildren (exp, n, sep = ' ') {
  return exp
    .slice(n)
    .map((_, i) => printChild(exp, n + i))
    .join(sep)
}

const childType = child =>
  isSymbol(child) ? 'symbol' : typeof child

function printChild (parentExp, i) {
  const childExp = parentExp.get(i)
  let format = null

  if (isCall(childExp)) {
    const parent = parentExp.first()
    const child = childExp.first()
    if (child === specials.comment && (parent !== specials.bind || i !== 1)) {
      format = x => chalk.dim.strikethrough('#' + printChildren(x, 1))
    } else if (child === specials.quote) {
      format = x => chalk.cyan('\\') + printChildren(x, 1)
    } else if (child === specials.expand) {
      format = x => chalk.cyan('$') + printChildren(x, 1)
    } else if (child === specials.set) {
      format = x => chalk.cyan('{') + printChildren(x, 1) + chalk.cyan('}')
    } else if (child === specials.complement && childExp.getIn([0, 1]) === specials.set) {
      format = x => chalk.cyan('-') + printChildren(x, 1)
    } else {
      format = x => chalk.cyan('(') + printChildren(x, 0) + chalk.cyan(')')
    }
  } else if (isBind(childExp) && (!isBind(parentExp) || i !== 0)) {
    format = x => printChildren(x, 0, chalk.cyan(': '))
  } else if (isList(childExp)) {
    format = x => chalk.cyan('[') + printChildren(x, 0) + chalk.cyan(']')
  } else {
    format = {
      boolean: chalk.yellow,
      number: chalk.yellow,
      string: chalk.green,
      symbol: x => (specials[x] ? chalk.blue.bold : chalk.blue)(x.sym),
      undefined: chalk.yellow,
      object: chalk.yellow
    }[childType(childExp)] || (exp => exp)
  }

  return format(childExp)
}

function print (exps, expTotal = 0) {
  return printChildren(exps.map((exp, i) => bind(expTotal + i, exp)), 0, '\n')
}

//
// REP Loop
//

let replState = im.Record({
  env: im.Map([
    [specials.bind, evalBind],
    [specials.expand, evalExpand],
    [specials.list, evalList],
    [specials.quote, evalQuote],
    [specials.activeEval, evalSymExp],
    [symbol('inc'), (exp, env) => 1 + evalSymExp(exp.get(1), env)],
    [specials.do, evalDo],
    ['unquotedForms', im.Set([specials.bind, specials.list])],
    ['expTotal', 0]
  ]),
  exps: im.List(),
  vals: im.List()
})()

function rep (str) {
  try {
    const exps = read(str)
    replState = evaluate(replState, exps)
    const out = print(replState.vals, replState.env.get('expTotal'))
    return out
  } catch (e) {
    return printChildren(list([bind(specials.error, `"${e.message}"`)]), 0)
  }
}

module.exports = {
  bind,
  call,
  isCall,
  isList,
  list,
  rep,
  replState,
  sym
}
