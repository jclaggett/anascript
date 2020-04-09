'use strict'

const os = require('os')
const process = require('process')
const readline = require('readline')
const reader = require('./reader')
const treeify = require('treeify')

function READ (str) {
  return reader.readStr(str)
}

function EVAL (ast, evn) {
  return ast
}

function PRINT (exp) {
  return `#eval: ${reader.writeAST(exp)}\n#AST :\n${treeify.asTree(reader.simplifyAST(exp), true)}`
}

function rep (str) {
  try {
    return PRINT(EVAL(READ(str)))
  } catch (e) {
    return `#Error: "${e.message}"`
  }
}

function main () {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '#user> '
  })

  rl.on('line', (line) => {
    rl.output.write((line === '') ? line : rep(line) + os.EOL)
    rl.prompt()
  }).on('close', () => {
    rl.output.write(os.EOL)
  }).prompt()
}

module.exports = {
  rep, main
}
