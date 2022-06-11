'use strict'

const im = require('immutable')

// Utils

const throwError = msg => {
  throw new Error(msg)
}

// Language primitives
const toJS = x =>
  x instanceof im.Collection
    ? x.toJS()
    : x

const Sym = im.Record({ sym: null }, 'Sym')
const negValue = im.Record({}, 'negValue')({})
const makeSym = sym => Sym({ sym })

const syms = { env: makeSym('env') }
const sym = name => {
  if (!(name in syms)) {
    syms[name] = makeSym(name)
  }
  return syms[name]
}

const makeSet = (...xs) => im.Map(xs)
const makeList = (...xs) => im.List(xs)
const makeForm = (name, ...args) => makeList(sym(name), ...args)

const is = im.is
const isSym = x => x instanceof Sym
const isList = x => im.List.isList(x)
const isSet = x => im.Map.isMap(x)
const isFn = x => typeof x === 'function'
const isForm = (x, ...names) =>
  isList(x) && names.some(name => is(x.first(), sym(name)))
const isNumber = x => typeof x === 'number'

const isNegSet = x => x.contains(negValue)
const isPosSet = x => !isNegSet(x)

const isPos = x => isNumber(x)
  ? x >= 0
  : isSet(x)
    ? isPosSet(x)
    : null

const isNeg = x => isNumber(x)
  ? x < 0
  : isSet(x)
    ? isNegSet(x)
    : null

const getType = x =>
  isSet(x)
    ? 'set'
    : isSym(x)
      ? 'symbol'
      : isList(x)
        ? 'list'
        : typeof x

const conjReducer = fn => {
  const reducer = (col, x) =>
    isForm(x, 'bind')
      ? col.set(x.get(1), x.get(2))
      : isForm(x, 'binds')
        ? x.rest().reduce(reducer, col)
        : isForm(x, 'spread')
          ? isList(x.get(1))
            ? x.get(1)
              .reduce(reducer, col)
            : x.get(1)
              .map((v, k) => makeForm('bind', k, v))
              .reduce(reducer, col)
          : fn(col, x)
  return reducer
}

const conjReducerList = conjReducer((col, x) => col.push(x))
const conjReducerSet = conjReducer((col, x) => col.set(x, x))

const conj = (col, ...xs) =>
  xs.reduce(isList(col)
    ? conjReducerList
    : isSet(col)
      ? conjReducerSet
      : throwError(`Unable to conj onto type ${getType(col)}. Must be type set or list`),
  col)

const complement = x =>
  isSet(x)
    ? isNegSet(x)
      ? x.remove(negValue)
      : x.set(negValue, negValue)
    : isNumber(x)
      ? -x
      : x

module.exports = {
  complement,
  conj,
  getType,
  is,
  isFn,
  isForm,
  isList,
  isSet,
  isSym,
  isNumber,
  isPos,
  isNeg,
  makeForm,
  makeList,
  makeSet,
  makeSym,
  sym,
  syms,
  throwError,
  toJS
}
