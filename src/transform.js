import { identity, compose, derive, rest, contains } from './xf/util.js'

// Transforming: AST -> AST
// Keep this as a single-pass rule-dispatched walk.
const undefinedAst = { type: 'undefined', text: 'undefined', children: [] }
const nth = (ast, i) =>
  (i < 0
    ? ast.children[ast.children.length + i]
    : ast.children[i]) ?? undefinedAst

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
  'comment',
  'do',
  'expand',
  'fn',
  'if',
  'label',
  'quote',
  'spread')

const replaceWithSyntax = (ast) =>
  isSyntaxCall(ast.children[0]?.text)
    ? derive({
      type: nth(ast, 0).text,
      children: rest(ast.children)
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

const removeForm = compose(transform, replaceSelfWithChild)
const transformCall = compose(transformChildren, replaceWithSyntax, replaceChildWithSelf)
const transformList = compose(replaceWithCall, transformCall)
const transformSet = transformList

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

export function transform (ast) {
  return (transformRules[ast.type] ?? identity)(ast)
}
