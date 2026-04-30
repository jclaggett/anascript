import ebnf from 'ebnf'

import { grammar } from './grammar.js'

import * as lang from './lang.js'
import { compose } from './xf/util.js'
import { transform } from './transform.js'

export { transform }

// Parsing: text -> Abstract Syntax Tree (AST)

const anaParser = new ebnf.Grammars.W3C.Parser(grammar)

export const parse = (str) => {
  const ast = anaParser.getAST(str.length === 0 ? ' ' : str)

  if (!ast) {
    throw new Error('Failed to parse input')
  }

  return ast
}

const fromAst = (ast) =>
  (fromAstRules[ast.type] ?? fromAstSpecial)(ast)

const fromAstChildren = (ast) =>
  ast.children
    .filter(child => child.type !== 'comment')
    .map(fromAst)

const fromAstSpecial = (ast) =>
  lang.makeList(lang.sym(ast.type), ...fromAstChildren(ast))

const fromAstList = (ast) =>
  lang.makeList(...fromAstChildren(ast))

const fromAstRules = {
  forms: fromAstList,
  call: fromAstList,
  symbol: (ast) => lang.sym(ast.text),
  number: (ast) => parseFloat(ast.text),
  string: (ast) => ast.text.substr(1, ast.text.length - 2),
  boolean: (ast) => ast.text === 'true',
  null: (_ast) => null,
  undefined: (_ast) => undefined
}

// legacy api
export const form = compose(fromAst, transform)
export const read = compose(fromAst, transform, parse)
