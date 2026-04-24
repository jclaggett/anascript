import { identity, derive, compose, rest, contains } from './xf/util.js'

// Transforming: AST -> AST
// Keep this as a single-pass rule-dispatched walk.
const undefinedAst = { type: 'undefined', text: 'undefined', children: [] }
const nth = (ast, i) =>
  (i < 0
    ? ast.children[ast.children.length + i]
    : ast.children[i]) ?? undefinedAst

const withAst = (ctx, ast) =>
  ({ ...ctx, ast })

const transformAst = (astTransformer) =>
  (ctx) => withAst(ctx, astTransformer(ctx.ast))

const transformChildren = (ctx) =>
  withAst(ctx, derive({
    children: ctx.ast.children.map((child) =>
      transform(child, ctx))
  }, ctx.ast))

const replaceChildWithSelf = transformAst((ast) =>
  ast.children.length > 0
    ? derive({
      children: ast.children[0].children
    }, ast)
    : ast)

const isSyntaxCall = contains(
  'comment',
  'do',
  'expand',
  'fn',
  'if',
  'label',
  'quote',
  'spread')

const replaceWithSyntax = transformAst((ast) =>
  isSyntaxCall(ast.children[0]?.text)
    ? derive({
      type: nth(ast, 0).text,
      children: rest(ast.children)
    }, ast)
    : ast)

const replaceWithCall = transformAst((ast) => derive({
  type: 'call',
  children: [
    { type: 'symbol', text: ast.type, children: [] },
    ...ast.children
  ]
}, ast))

const removeForm = compose(
  transformCtx,
  transformAst((ast) => ast.children[0])
)

const transformCall = compose(
  transformChildren,
  replaceWithSyntax,
  replaceChildWithSelf
)

const transformList = compose(
  replaceWithCall,
  transformCall
)

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

function transformCtx (ctx) {
  return (transformRules[ctx.ast.type] ?? identity)(ctx)
}

function transform (ast, ctx = {}) {
  return transformCtx(withAst(ctx, ast)).ast
}

export { transform }
