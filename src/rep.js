'use strict'

const fs = require('fs')
const path = require('path')

const chalk = require('chalk')

const ebnf = require('ebnf')

const lsnParser = new ebnf.Grammars.W3C.Parser(fs.readFileSync(path.resolve(__dirname, 'lsn.ebnf.w3c')).toString())

class Symbol extends String { }

const specials = {
  bind: new Symbol('bind'),
  comment: new Symbol('comment'),
  complement: new Symbol('complement'),
  deref: new Symbol('deref'),
  list: new Symbol('list'),
  ref: new Symbol('ref'),
  set: new Symbol('set')
}

function walk (ast, rules) {
  if (!(ast.type in rules)) {
    throw new Error(`Unknown AST Type: ${ast.type}`)
  }
  return rules[ast.type](ast, rules)
}

const children = (ast, rules) => ast.children.map(child => walk(child, rules))
const child = (ast, rules) => children(ast, rules)[0]
const sexpr = (type, f) => (ast, rules) => [type, ...f(ast, rules)]

const readRules = {
  forms: children,
  form1: child,
  form2: child,
  form3: child,
  form4: child,

  comment: sexpr(specials.comment, children),
  bind: sexpr(specials.bind, children),
  sigil: sexpr(specials.ref, children),
  round: child,
  square: sexpr(specials.list, child),
  curly: sexpr(specials.set, child),
  complement: sexpr(specials.complement, children),

  number: ast => parseFloat(ast.text),
  string: ast => ast.text,
  boolean: ast => ast.text === 'true',
  null: ast => null,
  undefined: ast => undefined,
  symbol: ast => specials[ast.text] || new Symbol(ast.text)
}

function read (str) {
  const ast = lsnParser.getAST(str)

  if (!ast) {
    throw new Error('Failed to parse input')
  }

  return walk(ast, readRules)
}

function evaluate (ast, env) {
  return ast
}

const cp = s => chalk.keyword('cyan')(s) + chalk.reset('')

function printChildren (exp, n, sep = ' ') {
  return exp.slice(n).map((_, i) => printChild(exp, n + i)).join(sep)
}
function printChild (exp, i) {
  const childExp = exp[i]
  let s = childExp
  if (childExp instanceof Array) {
    const parent = exp[0]
    const child = childExp[0]
    if (child === specials.comment && (parent !== specials.bind || i !== 1)) {
      s = chalk.dim.strikethrough('#' + printChild(childExp, 1))
    } else if (child === specials.bind && (parent !== specials.bind || i !== 1)) {
      s = printChildren(childExp, 1, cp(':'))
    } else if (child === specials.list) {
      s = cp('[') + printChildren(childExp, 1) + cp(']')
    } else if (child === specials.set) {
      s = cp('{') + printChildren(childExp, 1) + cp('}')
    } else if (child === specials.complement && childExp[1][0] === specials.set) {
      s = cp('-') + printChild(childExp, 1)
    } else {
      s = cp('(') + printChildren(childExp, 0) + cp(')')
    }
  } else if (childExp instanceof Symbol) {
    s = specials[childExp] ? chalk.blue(childExp) : childExp
  } else {
    s = {
      boolean: chalk.yellow,
      number: chalk.red.dim,
      string: chalk.green,
      undefined: chalk.yellow,
      object: chalk.yellow
    }[typeof childExp](childExp) || childExp
  }

  return s
}

function print (exp) {
  return `#eval: ${printChildren(exp, 0)}`
}

function rep (str) {
  try {
    return print(evaluate(read(str)))
  } catch (e) {
    return `#error: "${e.message}"`
  }
}

module.exports = rep
