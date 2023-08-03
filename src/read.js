import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import ebnf from 'ebnf'

import {
  isForm,
  makeForm,
  makeList,
  makeSym,
  syms
} from './lang.js'

// Parsing: converting text into an Abstract Syntax Tree (AST)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const anaParser = new ebnf.Grammars.W3C.Parser(
  fs.readFileSync(path.resolve(__dirname, 'grammar.ebnf'))
    .toString())

export const parse = str => {
  const ast = anaParser.getAST(str + ' ')

  if (!ast) {
    throw new Error('Failed to parse input')
  }

  return ast
}

// Forming: converting an AST into a Lisp Form

const formChildren = ast =>
  makeList(...ast.children
    .map(form)
    .filter(x => !isForm(x, 'comment')))

const replaceWithChild = ast =>
  ast.children.length > 0
    ? form(ast.children[0])
    : makeList()

const formRules = {
  forms: formChildren,
  form1: replaceWithChild,
  form2: replaceWithChild,
  form3: replaceWithChild,
  form4: replaceWithChild,

  // The three collection syntaxes all have a single, optional child of 'forms'
  round: replaceWithChild,
  square: ast => makeForm('list', ...replaceWithChild(ast)),
  curly: ast => {
    const setForm = makeForm('set', ...replaceWithChild(ast))
    return ast.text[0] === '~'
      ? makeForm('remove', setForm)
      : setForm
  },

  comment: ast => makeForm('comment', ...formChildren(ast)),
  label: ast => makeForm('label', ...formChildren(ast)),
  expand: ast => makeForm('expand', ...formChildren(ast)),
  quote: ast => makeForm('quote', ...formChildren(ast)),
  spread: ast => makeForm('spread', ...formChildren(ast)),
  number: ast => parseFloat(ast.text),
  string: ast => ast.text.substr(1, ast.text.length - 2),
  boolean: ast => ast.text === 'true',
  null: _ast => null,
  undefined: _ast => undefined,
  symbol: ast => syms[ast.text] || makeSym(ast.text)
}

export const form = ast =>
  formRules[ast.type](ast)

export const read = str =>
  form(parse(str))
