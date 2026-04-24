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

const withCtx = (ctx, next) =>
  ({ ...ctx, ...next })

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

const transformCall = (ctx) => {
  const originalType = ctx.ast.type
  const next = replaceWithSyntax(replaceChildWithSelf(ctx))
  return (originalType === 'call' && next.ast.type !== 'call')
    ? transformCtx(next)
    : transformChildren(next)
}

const transformList = compose(
  replaceWithCall,
  transformCall
)

const transformSet = transformList

const createExpand = (ast) =>
  derive({
    type: 'call',
    children: [
      { type: 'symbol', text: 'expand', children: [] },
      ast
    ]
  }, ast)

const transformSym = (ctx) =>
  ctx.protectSymbols
    ? ctx
    : withAst(ctx, createExpand(ctx.ast))

const transformQuote = (ctx) =>
  withAst(ctx, derive({
    children: ctx.ast.children.map((child) =>
      transform(child, withCtx(ctx, { protectSymbols: true })))
  }, ctx.ast))

const transformExpand = (ctx) =>
  withAst(ctx, derive({
    children: ctx.ast.children.map((child) =>
      transform(child, withCtx(ctx, { protectSymbols: true })))
  }, ctx.ast))

const transformFn = (ctx) =>
  withAst(ctx, derive({
    children: [
      transform(ctx.ast.children[0], withCtx(ctx, { protectSymbols: true })),
      ...ctx.ast.children.slice(1).map((child) => transform(child, ctx))
    ]
  }, ctx.ast))

const transformLabel = (ctx) =>
  withAst(ctx, derive({
    children: [
      transform(ctx.ast.children[0], withCtx(ctx, { protectSymbols: true })),
      transform(ctx.ast.children[1], ctx)
    ]
  }, ctx.ast))

const transformRules = {
  forms: transformChildren,
  form1: removeForm,
  form2: removeForm,
  form3: removeForm,
  form4: removeForm,
  comment: transformChildren,
  do: transformChildren,
  if: transformChildren,
  label: transformLabel,
  spread: transformChildren,
  expand: transformExpand,
  fn: transformFn,
  quote: transformQuote,
  call: transformCall,
  list: transformList,
  set: transformSet,
  symbol: transformSym
}

function transformCtx (ctx) {
  return (transformRules[ctx.ast.type] ?? identity)(ctx)
}

function transform (ast, ctx = {}) {
  return transformCtx(withAst(ctx, ast)).ast
}

export { transform }
