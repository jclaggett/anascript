import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import ebnf from 'ebnf'
import printTree from 'print-tree'
import highlightES from 'highlight-es'

import { first, rest, identity, compose, derive, butLast, contains } from './xf/util.js'
import * as lang from './lang.js'
import { printSyntax } from './print.js'

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
// - normalize calls as syntax
// - remove comments
const undefinedAst = { type: 'undefined', text: 'undefined', children: [] }
const nth = (ast, i) =>
  (i < 0
    ? ast.children[ast.children.length + i]
    : ast.children[i]) ?? undefinedAst

const isLiteral = contains('number', 'string', 'boolean', 'null', 'undefined')

const createSym = (text) =>
  ({ type: 'symbol', text, children: [] })

const relabel = (lhs, rhs) =>
  lhs.type === 'label'
    ? derive({
      children: [
        nth(lhs, 0),
        relabel(nth(lhs, 1), rhs)
      ]
    }, lhs)
    : { type: 'label', text: `${lhs.text}: ${rhs.text}`, children: [lhs, rhs] }

const push = (xs, x) => {
  xs.push(x)
  return xs
}

const unchainLabels = (ast) =>
  ast.type === 'label'
    ? push(unchainLabels(nth(ast, 1)), nth(ast, 0))
    : [ast]

const getRhs = (ast) =>
  ast.type === 'label'
    ? getRhs(nth(ast, 1))
    : ast

export const transform = (ast) => (transformRules[ast.type] ?? identity)(ast)

const transformChildren = (ast) =>
  derive({
    children: ast.children.map(transform)
  }, ast)

const replaceSelfWithChild = (ast) =>
  ast.children[0]

const replaceChildWithSelf = (ast) =>
  ast.children.length > 0
    ? derive({
      children: ast.children[0].children
    }, ast)
    : ast

const isSyntaxCall = contains(
  '+',
  '-',
  '*',
  '/',
  'comment',
  'do',
  'expand',
  'fn',
  'if',
  'label',
  'quote',
  'spread')

const transformCallToSyntax = (ast) =>
  isSyntaxCall(ast.children[0]?.text)
    ? derive({
      type: nth(ast, 0).text,
      children: ast.children.slice(1)
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
      children: [createSym('remove'), ast]
    }, ast)
    : ast

const removeForm = compose(transform, replaceSelfWithChild)
const transformCall = compose(transformChildren, transformCallToSyntax, replaceChildWithSelf)
const transformList = compose(replaceWithCall, transformCall)
const transformSet = compose(insertRemove, transformList)

const transformRules = {
  forms: transformChildren,
  form1: removeForm,
  form2: removeForm,
  form3: removeForm,
  form4: removeForm,
  comment: transformChildren,
  label: transformChildren,
  spread: transformChildren,
  expand: transformChildren,
  quote: transformChildren,
  call: transformCall,
  list: transformList,
  set: transformSet
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

// Emitting 2: AST -> JS

let nameIndex = 0

const emitMathRules = (emit) => ({
  '+': (ast) =>
    ast.children.length === 0
      ? '0'
      : ast.children.length === 1
        ? emit(nth(ast, 0))
        : `(${ast.children.map(emit).join(' + ')})`,
  '-': (ast) =>
    ast.children.length === 0
      ? 'NaN'
      : ast.children.length === 1
        ? `(0 - ${emit(nth(ast, 0))})`
        : `(${ast.children.map(emit).join(' - ')})`,
  '*': (ast) =>
    ast.children.length === 0
      ? '1'
      : ast.children.length === 1
        ? emit(nth(ast, 0))
        : `(${ast.children.map(emit).join(' * ')})`,
  '/': (ast) =>
    ast.children.length === 0
      ? 'NaN'
      : ast.children.length === 1
        ? `(1 / ${emit(nth(ast, 0))})`
        : `(${ast.children.map(emit).join(' / ')})`
})

const createJSEmitter = (scope) => {
  const emit = (ast) => (emitRules[ast.type] ?? emitText)(ast)
  const emitText = (ast) => ast.text
  const emitBlock = (ast) => ast.children.map(emit)
    .join(`;\n${scope._indent}`)
    .concat(';')

  const emitLabel = (ast) => {
    const asts = unchainLabels(ast)
    const rhs = emit(first(asts))

    // Don't emit anything if the value to be set is a literal.
    // Instead set the names to that literal.
    if (isLiteral(first(asts))) {
      return rest(asts)
        .map(ast => `// ${ast.text} = ${emitScopedSetName(ast, rhs)}`)
    }
    return asts.length > 2
      ? `tmp = ${rhs};\n${scope._indent}` + rest(asts)
      .map(lhs => `const ${emitScopedSetName(lhs)} = tmp`)
      .join(`;\n${scope._indent}`)
      : `const ${emitScopedSetName(first(asts))} = ${rhs}`
  }

  const emitFn = (ast) => { // call 'fn' args ...body
    const _indent = scope._indent + '  '
    const emitJS = createJSEmitter(derive({ _indent }, scope))
    const body = [
      relabel(nth(ast, 0), { type: 'text', text: 'args', children: [] }),
      ...ast.children.slice(1, -1)
    ]
      .map(emitJS)
      .concat(['return ' + emitJS(
        ast.children.length > 1
          ? getRhs(nth(ast, -1))
          : undefinedAst)
      ])
      .join(`;\n${_indent}`)
    return `((...args) => {\n${_indent}${body};\n${scope._indent}})`
  }

  const emitDo = (ast) => { // call 'fn' ...body
    const _indent = scope._indent + '  '
    const emitJS = createJSEmitter(derive({ _indent }, scope))
    const body = butLast(ast.children)
      .map(emitJS)
      .concat(['return ' + emitJS(ast.children.length > 0
        ? getRhs(nth(ast, -1))
        : undefinedAst)])
      .join(`;\n${_indent}`)
    return `(() => {\n${_indent}${body};\n${scope._indent}})()`
  }

  const emitScopedSetName = (ast, value = undefined) => {
    if (value != null) {
      scope[ast.text] = value
    } else if (scope[ast.text] == null || Object.hasOwn(scope, ast.text)) {
      scope[ast.text] = `v${nameIndex++}`
    }

    return scope[ast.text]
  }

  const emitScopedGetName = (ast) => {
    if (scope[ast.text] == null) {
      scope[ast.text] = `v${nameIndex++}`
    }
    return scope[ast.text]
  }

  const emitCall = (ast) =>
    ast.children.length > 0
      ? `${emit(nth(ast, 0))}(${rest(ast.children).map(emit).join(', ')})`
      : 'lang.emptyList'

  const emitRules = {
    comment: (_ast) => '',
    forms: emitBlock,
    label: emitLabel,
    expand: (ast) => emitScopedGetName(nth(ast, 0)),
    call: emitCall,
    symbol: emitScopedGetName,
    fn: emitFn,
    do: emitDo,
    if: (ast) =>
      `(${emit(nth(ast, 0))} ? ${emit(nth(ast, 1))} : ${emit(nth(ast, 2))})`,
    ...emitMathRules(emit)
  }

  return emit
}

export const emitJS = createJSEmitter({
  _indent: '',
  conj: 'lang.conj',
  list: 'lang.makeList',
  set: 'lang.makeSet',
  'fn?': 'lang.isFn',
  'pos?': 'lang.isPos',
  'neg?': 'lang.isNeg',
  'zero?': 'lang.isZero'
})

export const testJS = (str) => {
  nameIndex = 0

  const ast = parse(`(do ${str})`)
  console.log('_________')
  emitTree(ast)

  const ast2 = transform(ast)
  console.log('_________')
  emitTree(ast2)

  const lisp = emitLisp(ast2)
  console.log(`_________\n${printSyntax(lisp)}`)

  const text = 'let tmp = null;\n' + emitJS(ast2)
  console.log(`_________\n${highlightES(text)}\n_________`)

  // eslint-disable-next-line no-eval
  return lang.toJS(eval(text))
}

// Emitting 3: AST -> str
export const emitTree = (ast) =>
  printTree(ast,
    node => node.type + (
      node.children.length > 0
        ? ''
        : " '" + node.text + "'"),
    node => node.children)

// legacy api
export const form = compose(emitLisp, transform)
export const read = compose(emitLisp, transform, parse)
