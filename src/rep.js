'use strict'

const fs = require('fs')
const path = require('path')

const chalk = require('chalk')

const ebnf = require('ebnf')

const lsnParser = new ebnf.Grammars.W3C.Parser(fs.readFileSync(path.resolve(__dirname, 'lsn.ebnf.w3c')).toString())

class Symbol extends String { }

const color = {
  punct: chalk.keyword('orange'),
  comment: chalk.dim
}

const specials = {
  comment: new Symbol('comment'),
  bind: new Symbol('bind'),
  ref: new Symbol('ref'),
  deref: new Symbol('deref'),
  list: new Symbol('list'),
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

const cp = s => chalk.keyword('orange')(s) + chalk.reset('')

function printChildrenExp (exp, n, sep = ' ') {
  return exp.slice(n).map((_, i) => printChildExp(exp, n + i)).join(sep)
}
function printChildExp (parentExp, i) {
  const parent = parentExp[0]
  const exp = parentExp[i]
  let s = chalk`{green ${exp}}`
  if (exp instanceof Array) {
    const child = exp[0]
    if (child === specials.comment && (parent !== specials.bind || i !== 1)) {
      s = chalk.dim('#' + printChildExp(exp, 1))
    } else if (child === specials.bind && (parent !== specials.bind || i !== 1)) {
      s = printChildrenExp(exp, 1, cp(':'))
    } else if (child === specials.list) {
      s = cp('[') + printChildrenExp(exp, 1) + cp(']')
    } else if (child === specials.set) {
      s = cp('{') + printChildrenExp(exp, 1) + cp('}')
    } else {
      s = cp('(') + printChildrenExp(exp, 0) + cp(')')
    }
  }

  return s
}

function print (exp) {
  return `#eval: ${printChildrenExp(exp, 0)}`
}

function rep (str) {
  try {
    return print(evaluate(read(str)))
  } catch (e) {
    return `#error: "${e.message}"`
  }
}

module.exports = rep
