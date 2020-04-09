'use strict'
const fs = require('fs')
const path = require('path')

const ebnf = require('ebnf')

const lsn = new ebnf.Grammars.W3C.Parser(fs.readFileSync(path.resolve(__dirname, 'lsn.ebnf.w3c')).toString())

function walk (ast, rules) {
  if (!(ast.type in rules)) {
    throw new Error(`Unknown AST Type: ${ast.type}`)
  }
  return rules[ast.type](ast, rules)
}

const identity = x => x
const branch = f => (ast, rules) => f(ast.children.map(child => walk(child, rules)))
const twig = f => (ast, rules) => f(branch(identity)(ast, rules)[0])
const leaf = f => (ast, rules) => f(ast.text)
const node = f => (ast, rules) => ({ [ast.type]: f(ast, rules) })

const defaultRules = {
  forms: branch(identity),
  entry: twig(identity),
  value: twig(identity),
  base_value: twig(identity),
  collection: twig(identity),
  simple: twig(identity),

  pair: branch(identity),
  comment: twig(identity),
  sigil_value: twig(identity),
  round: twig(identity),
  square: twig(identity),
  curly: twig(identity),

  number: leaf(identity),
  string: leaf(identity),
  boolean: leaf(identity),
  null: leaf(identity),
  undefined: leaf(identity),
  symbol: leaf(identity)
}

const writeRules = {
  ...defaultRules,

  forms: branch(children => children.join(' ')),

  pair: branch(children => children.join(': ')),
  comment: twig(child => ''),
  sigil_value: twig(child => `$${child}`),
  round: twig(child => `( ${child} )`),
  square: twig(child => `[ ${child} ]`),
  curly: twig(child => `{ ${child} }`)
}

const simplifyRules = {
  ...defaultRules,

  pair: node(branch(identity)),
  comment: node(twig(identity)),
  sigil_value: node(twig(identity)),
  round: node(twig(identity)),
  square: node(twig(identity)),
  curly: node(twig(identity)),

  number: node(leaf(text => parseFloat(text))),
  string: node(leaf(text => text.slice(1, -1))),
  boolean: node(leaf(text => text === 'true')),
  null: node(leaf(text => null)),
  undefined: node(leaf(text => undefined)),
  symbol: node(leaf(text => text))
}

function simplifyAST (ast) {
  return walk(ast, simplifyRules)
}

function writeAST (ast) {
  return walk(ast, writeRules)
}

function readStr (str) {
  const ast = lsn.getAST(str)

  if (!ast) {
    throw new Error('Failed to parse input')
  }

  return ast
}

module.exports = {
  readStr,
  simplifyAST,
  writeAST
}
