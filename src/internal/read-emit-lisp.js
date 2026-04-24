import * as lang from '../lang.js'

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
