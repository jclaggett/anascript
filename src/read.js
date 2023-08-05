import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import ebnf from 'ebnf'
import printTree from 'print-tree'

import { identity, compose, derive } from './xf/util.js'
import {
  makeList,
  makeSym,
  syms
} from './lang.js'

// Parsing: text -> Abstract Syntax Tree (AST)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const anaParser = new ebnf.Grammars.W3C.Parser(
  fs.readFileSync(path.resolve(__dirname, 'grammar.ebnf'))
    .toString())

export const parse = str => {
  const ast = anaParser.getAST(str.length === 0 ? ' ' : str)

  if (!ast) {
    throw new Error('Failed to parse input')
  }

  return ast
}

// Transforming: AST -> AST
// - remove abstract branches
// - normalize syntax as calls
// - remove comments
export const transform = (ast) => (transformRules[ast.type] ?? identity)(ast)

const transformChildren = (ast) =>
  derive({
    children: ast.children
      .map(transform)
      // filter out comments
      .filter((ast) =>
        !(ast.type === 'call' &&
          ast.children[0]?.type === 'symbol' &&
          ast.children[0]?.text === 'comment'))
  }, ast)

const replaceSelfWithChild = (ast) =>
  ast.children[0]

const replaceChildWithSelf = (ast) =>
  ast.children.length > 0
    ? derive({
      children: ast.children[0].children
    }, ast)
    : ast

const replaceWithCall = (ast) =>
  derive({
    type: 'call',
    children: [
      { type: 'symbol', text: ast.type, children: [] },
      ...ast.children
    ]
  }, ast)

const insertRemove = (ast) =>
  ast.text[0] === '~'
    ? derive({
      type: 'call',
      children: [{ type: 'symbol', text: 'remove', children: [] }, ast]
    }, ast)
    : ast

const removeForm = compose(transform, replaceSelfWithChild)
const transformSyntax = compose(replaceWithCall, transformChildren)
const transformCall = compose(transformChildren, replaceChildWithSelf)
const transformList = compose(replaceWithCall, transformCall)
const transformSet = compose(insertRemove, transformList)

const transformRules = {
  forms: transformChildren,
  form1: removeForm,
  form2: removeForm,
  form3: removeForm,
  form4: removeForm,
  comment: replaceWithCall,
  label: transformSyntax,
  spread: transformSyntax,
  expand: transformSyntax,
  quote: transformSyntax,
  call: transformCall,
  list: transformList,
  set: transformSet
}

// Emitting 1: AST -> Lisp
export const emitLisp = (ast) => emitRules[ast.type](ast)
const emitList = (ast) => makeList(...ast.children.map(emitLisp))

const emitRules = {
  forms: emitList,
  call: emitList,
  symbol: (ast) => syms[ast.text] || makeSym(ast.text),
  number: (ast) => parseFloat(ast.text),
  string: (ast) => ast.text.substr(1, ast.text.length - 2),
  boolean: (ast) => ast.text === 'true',
  null: (_ast) => null,
  undefined: (_ast) => undefined
}

// Emitting 2: AST -> Javascript

// Emitting 3: AST -> str
export const emitTree = (ast) =>
  printTree(ast,
    node => node.type + (
      node.children.length > 0
        ? ''
        : ' "' + node.text + '"'),
    node => node.children)

// legacy api
export const form = compose(emitLisp, transform)
export const read = compose(emitLisp, transform, parse)
