'use strict'

const chalk = require('chalk')

const {
  getDefault,
  getType,
  is,
  isSym,
  makeLabel,
  syms
} = require('./lang')

// Printing
const printRules = {
  list: (x, r) =>
    isSym(x.first())
      ? r.round(x, r)
      : r.square(x, r),
  set: (x, r) =>
    chalk.cyan('{') +
    x.map((v, k) =>
      is(k, v)
        ? print(k, r)
        : printLabel(makeLabel(k, v), r))
      .join(', ') +
    chalk.cyan('}'),
  square: (x, r) =>
    chalk.cyan('[') + printChildren(x, r, ', ') + chalk.cyan(']'),
  round: (x, r) =>
    chalk.cyan('(') + printChildren(x, r) + chalk.cyan(')'),
  symbol: x => (x.sym in syms ? chalk.blue.bold : chalk.blue)(x.sym),
  string: x => chalk.green(`"${x}"`),
  boolean: x => chalk.yellow(x),
  number: x => chalk.yellow(x),
  undefined: x => chalk.yellow(x),
  object: x => chalk.yellow(x),
  function: x => chalk.yellow(`<${x.name ?? 'fn'}>`),
  label: (x, r) => printChildren(x.rest(), r, chalk.cyan(': '))

  // For now, these forms are just printed as lists
  // comment: (x, r) => chalk.dim.strikethrough('#' + printChildren(x.rest(), r)),
  // expand: x => chalk.cyan('$') + printChildren(x.rest()),
  // quote: x => chalk.cyan('\\') + printChildren(x.rest())
}

const printLabel = (x, r = printRules) =>
  r.label(x, r)

const printChildren = (x, rules, sep = ' ') =>
  x.map(child => print(child, rules)).join(sep)

const print = (x, r = printRules) =>
  getDefault(r, getType(x), x => x)(x, r)

// General
module.exports = {
  print,
  printLabel
}
