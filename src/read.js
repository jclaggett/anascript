import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import ebnf from 'ebnf'

import { compose } from './xf/util.js'
import { emitLisp } from './internal/read-emit-lisp.js'
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

// legacy api
export const form = compose(emitLisp, transform)
export const read = compose(emitLisp, transform, parse)
