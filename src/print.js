import chalk from 'chalk'

import {
  identity,
  complement,
  getType,
  is,
  isComplement,
  isForm,
  isSym,
  makeForm,
  syms
} from './lang.js'

// Printing
const printRules = {
  list: (x, r) =>
    isSym(x.first())
      ? r.round(x, r)
      : r.square(x, r),
  set: (x, r) =>
    (([lead, fn]) =>
      chalk.cyan(lead + '{') +
        fn(x).map((v, k) =>
          is(k, v)
            ? print(k, r)
            : printLabel(makeForm('label', k, v), r))
          .join(', ') +
        chalk.cyan('}')
    )(isComplement(x)
      ? ['~', complement]
      : ['', identity]),
  curly: (x, r) =>
    chalk.cyan('{') + printChildren(x, r, ', ') + chalk.cyan('}'),
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
  function: x => chalk.yellow(`<fn ${x.anaSig}>`),
  label: (x, r) => printChildren(x.rest(), r, chalk.cyan(': '))

  // For now, these forms are just printed as lists
  // comment: (x, r) => chalk.dim.strikethrough('#' + printChildren(x.rest(), r)),
  // expand: x => chalk.cyan('$') + printChildren(x.rest()),
  // quote: x => chalk.cyan('\\') + printChildren(x.rest())
}

const printRulesAsSyntax = {
  ...printRules,
  list: (x, r) =>
    isForm(x, 'label')
      ? r.label(x, r)
      : isForm(x, 'list')
        ? r.square(x.rest(), r)
        : isForm(x, 'set')
          ? r.curly(x.rest(), r)
          : isSym(x.first())
            ? r.round(x, r)
            : r.square(x, r)
}

export const printLabel = (x, r = printRules) =>
  r.label(x, r)

const printChildren = (x, rules, sep = ' ') =>
  x.map(child => print(child, rules)).join(sep)

export const print = (x, r = printRules) => {
  const rule = r[getType(x)]
  if (rule !== undefined) {
    return rule(x, r)
  } else {
    return x
  }
}

export const printSyntax = (x) =>
  print(x, printRulesAsSyntax)
