'use strict'

const fs = require('fs')
const path = require('path')

const ebnf = require('ebnf')

const {
  isForm,
  makeForm,
  makeList,
  makeSym,
  syms
} = require('./lang')

// Parsing: converting text into an Abstract Syntax Tree (AST)

const anaParser = new ebnf.Grammars.W3C.Parser(
  fs.readFileSync(path.resolve(__dirname, 'ebnf.w3c'))
    .toString())

const parse = str => {
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

const formRules = {
  forms: formChildren,
  form1: formChild,
  form2: formChild,
  form3: formChild,
  form4: formChild,

  comment: formSymList('comment', formChildren),
  label: formSymList('label', formChildren),
  expand: formSymList('expand', formChildren),
  quote: formSymList('quote', formChildren),
  spread: formSymList('spread', formChildren),
  round: formChild,
  square: formSymList('list', formChild),
  curly: formSymList('set', formChild),
  complement: formSymList('complement', formChildren),

  number: ast => parseFloat(ast.text),
  string: ast => ast.text.substr(1, ast.text.length - 2),
  boolean: ast => ast.text === 'true',
  null: _ast => null,
  undefined: _ast => undefined,
  symbol: ast => syms[ast.text] || makeSym(ast.text)
}

const form = ast =>
  formRules[ast.type](ast)

const read = str =>
  form(parse(str))

module.exports = {
  form,
  parse,
  read
}
