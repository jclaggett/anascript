import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import ebnf from 'ebnf'
import printTree from 'print-tree'

import { compose } from './xf/util.js'
import * as lang from './lang.js'
import { transform } from './transform.js'

export { transform }

// Parsing: text -> Abstract Syntax Tree (AST)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const anaParser = new ebnf.Grammars.W3C.Parser(
  fs.readFileSync(path.resolve(__dirname, 'grammar.ebnf'))
    .toString())

export const parse = (str) => {
  const ast = anaParser.getAST(str.length === 0 ? ' ' : str)

  if (!ast) {
    throw new Error('Failed to parse input')
  }

  return ast
}

// Emitting 1: AST -> Lisp
export const emitLisp = (ast) =>
  (emitLispRules[ast.type] ?? emitSpecial)(ast)
const emitChildren = (ast) =>
  ast.children
    .filter(child => child.type !== 'comment')
    .map(emitLisp)
const emitSpecial = (ast) =>
  lang.makeList(lang.sym(ast.type), ...emitChildren(ast))
const emitList = (ast) =>
  lang.makeList(...emitChildren(ast))

const emitLispRules = {
  forms: emitList,
  call: emitList,
  symbol: (ast) => lang.sym(ast.text),
  number: (ast) => parseFloat(ast.text),
  string: (ast) => ast.text.substr(1, ast.text.length - 2),
  boolean: (ast) => ast.text === 'true',
  null: (_ast) => null,
  undefined: (_ast) => undefined
}

// Emitting 3: AST -> str
const printPosition = (ast) =>
  ast.position != null
    ? `<${ast.position}> `
    : ''

export const emitTree = (ast) =>
  printTree(ast,
    (ast) => printPosition(ast) + ast.type + (
      ast.children.length > 0
        ? ''
        : " '" + ast.text + "'"),
    ast => ast.children)

// legacy api
export const form = compose(emitLisp, transform)
export const read = compose(emitLisp, transform, parse)
