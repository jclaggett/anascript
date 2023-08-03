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

const formChild = ast =>
  ast.children.length > 0
    ? form(ast.children[0])
    : makeList()

const formSymList = (name, formFn) =>
  ast =>
    makeForm(name, ...formFn(ast))

const formSetChild = formSymList('set', formChild)

const formRules = {
  forms: formChildren,
  form1: formChild,
  form2: formChild,
  form3: formChild,
  form4: formChild,

  // The three collection syntaxes all have a single, optional child of 'forms'
  round: formChild,
  square: formSymList('list', formChild),
  curly: ast => ast.text[0] === '~'
    ? makeForm('remove', formSetChild(ast))
    : formSetChild(ast),

  comment: formSymList('comment', formChildren),
  label: formSymList('label', formChildren),
  expand: formSymList('expand', formChildren),
  quote: formSymList('quote', formChildren),
  spread: formSymList('spread', formChildren),
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
