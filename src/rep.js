'use strict'

const fs = require('fs')
const path = require('path')

const im = require('immutable')
const chalk = require('chalk')

const ebnf = require('ebnf')

const lsnParser = new ebnf.Grammars.W3C.Parser(fs.readFileSync(path.resolve(__dirname, 'lsn.ebnf.w3c')).toString())

const symbol = text => im.Map({ symbol: text })
const isSymbol = x => im.has(x, 'symbol')
const isList = x => im.List.isList(x)
const isCallable = x => x instanceof Function

const specials = [
  'bind',
  'comment',
  'complement',
  'error',
  'eval',
  'expand',
  'list',
  'quote',
  'set'
].reduce((m, s) => { m[s] = symbol(s); return m }, {})

const bind = (k, v) => im.List([specials.bind, k, v])
// const list = vs => im.List([specials.list, ...vs])
// const set = vs => im.List([specials.set, ...vs])

const isForm = (x, val) => isList(x) && x.first() === val

//
// Read Section
//

function walkAST (ast, rules) {
  if (!(ast.type in rules)) {
    throw new Error(`Unknown AST Type: ${ast.type}`)
  }
  return rules[ast.type](ast, rules)
}

const children = (ast, rules) => ast.children.map(child => walkAST(child, rules))
const child = (ast, rules) => children(ast, rules)[0]
const sexpr = (type, f) => (ast, rules) => [type, ...(f(ast, rules) || [])]

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

  return im.fromJS(walkAST(ast, readRules))
}

//
// Evaluation Section
//

function evaluateList (exp, env) {
  return exp
    .slice(1)
    .map(item => env.get(specials.activeEval)(item, env))
    .unshift(exp.first())
}

function evaluateBind (exp, env) {
  return exp
    .update(1, childExp => evaluateExp(childExp, env.set(specials.activeEval, evaluateExp)))
    .update(2, childExp => env.get(specials.activeEval)(childExp, env))
}

function evaluateExpand (exp, env) {
  return env.get(evaluateExp(exp.get(1), env))
}

function evaluateQuote (exp, env) {
  return exp.get(1)
}

function evaluateExp (exp, env) {
  let val = exp
  if (isList(exp)) {
    const command = evaluateSymExp(exp.first(), env)
    if (isCallable(command)) {
      val = command(exp, env)
    } else {
      throw new Error(`Not callable: ${exp.first()} (${command})`)
    }
  }
  return val
}

function evaluateSymExp (exp, env) {
  if (isSymbol(exp)) {
    return env.get(exp)
  } else {
    return evaluateExp(exp, env)
  }
}

function updateEnv (env, val) {
  if (isForm(val, specials.bind)) {
    const lhs = val.get(1)
    const rhs = val.get(2)
    if (isForm(rhs, specials.bind)) {
      env = updateEnv(env, rhs)
      return env.set(lhs, env.get(rhs.get(1)))
    } else {
      return env.set(lhs, rhs)
    }
  } else {
    return env
  }
}

function evaluateBody (state, exp) {
  const val = evaluateSymExp(exp, state.get('env'))
  return state
    .update('vals', vals => vals.push(val))
    .update('env', env => updateEnv(env, val))
}

function evaluate (state, exps) {
  state = state.set('vals', im.List())
  return exps
    .reduce(evaluateBody, state)
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

function printChild (parentExp, i) {
  const childExp = parentExp.get(i)
  let format = null

  if (isList(childExp)) {
    const parent = parentExp.first()
    const child = childExp.first()
    if (child === specials.comment && (parent !== specials.bind || i !== 1)) {
      format = x => chalk.dim.strikethrough('#' + printChildren(x, 1))
    } else if (child === specials.bind && (parent !== specials.bind || i !== 1)) {
      format = x => printChildren(x, 1, chalk.cyan(': '))
    } else if (child === specials.quote) {
      format = x => chalk.cyan('\\') + printChildren(x, 1)
    } else if (child === specials.expand) {
      format = x => chalk.cyan('$') + printChildren(x, 1)
    } else if (child === specials.list) {
      format = x => chalk.cyan('[') + printChildren(x, 1) + chalk.cyan(']')
    } else if (child === specials.set) {
      format = x => chalk.cyan('{') + printChildren(x, 1) + chalk.cyan('}')
    } else if (child === specials.complement && childExp.getIn([0, 1]) === specials.set) {
      format = x => chalk.cyan('-') + printChildren(x, 1)
    } else {
      format = x => chalk.cyan('(') + printChildren(x, 0) + chalk.cyan(')')
    }
  } else if (isSymbol(childExp)) {
    const color = specials[childExp.get('symbol')] ? chalk.blue.bold : chalk.blue
    format = x => color(x.get('symbol'))
  } else {
    format = {
      boolean: chalk.yellow,
      number: chalk.yellow,
      string: chalk.green,
      undefined: chalk.yellow,
      object: chalk.yellow
    }[typeof childExp] || (exp => exp)
  }

  return format(childExp)
}

function print (exps, expTotal = 0) {
  return printChildren(exps.map((exp, i) => bind(expTotal + i, exp)), 0, '\n')
}

//
// REP Loop
//

let replState = im.fromJS({
  env: im.Map()
    .set(specials.bind, evaluateBind)
    .set(specials.expand, evaluateExpand)
    .set(specials.list, evaluateList)
    .set(specials.quote, evaluateQuote)
    .set(specials.activeEval, evaluateSymExp),
  exps: [],
  vals: [],
  expTotal: 0
})

function rep (str) {
  try {
    const exps = read(str)
    replState = evaluate(replState, exps)
    const out = print(replState.get('vals'), replState.get('expTotal'))
    return out
  } catch (e) {
    return printChildren(im.List([bind(specials.error, `"${e.message}"`)]), 0)
  }
}

module.exports = rep
