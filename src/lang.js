'use strict'

const im = require('immutable')

// Utils

const getDefault = (o, k, d) =>
  k in o ? o[k] : d

const throwError = msg => {
  throw new Error(msg)
}

// Language primitives
const toJS = x =>
  x instanceof im.Collection
    ? x.toJS()
    : x

const is = im.is

const Sym = im.Record({ sym: null }, 'Sym')
const makeSym = sym => Sym({ sym })

const syms = { env: makeSym('env') }
const sym = name => {
  if (!(name in syms)) {
    syms[name] = makeSym(name)
  }
  return syms[name]
}

const makeList = (...xs) =>
  im.List(xs)

const makeSet = (...xs) =>
  im.Map(xs)

const isSym = x => x instanceof Sym
const isList = x => im.List.isList(x)
const isSet = x => im.Map.isMap(x)

const getType = x =>
  isSet(x)
    ? 'set'
    : isSym(x)
      ? 'symbol'
      : isList(x)
        ? 'list'
        : typeof x

const isType = (x, t) =>
  getType(x) === t

const isForm = (x, ...names) =>
  isList(x) && names.some(name => is(x.first(), sym(name)))

const makeForm = (name, ...args) =>
  makeList(sym(name), ...args)

const makeBind = (k, v) =>
  makeForm('bind', k, v)

const makeLabel = (k, v) =>
  makeForm('label', k, v)

const makeQuote = x =>
  makeForm('quote', x)

const conjReducer = fn => {
  const reducer = (col, x) =>
    isForm(x, 'bind')
      ? col.set(x.get(1), x.get(2))
      : isForm(x, 'binds')
        ? x.rest().reduce(reducer, col)
        : isForm(x, 'spread')
          ? isType(x.get(1), 'list')
            ? x.get(1)
              .reduce(reducer, col)
            : x.get(1)
              .map((v, k) => makeBind(k, v))
              .reduce(reducer, col)
          : fn(col, x)
  return reducer
}

const conjReducerList = conjReducer((col, x) => col.push(x))
const conjReducerSet = conjReducer((col, x) => col.set(x, x))

const conj = (col, ...xs) =>
  xs.reduce(isType(col, 'list')
    ? conjReducerList
    : isType(col, 'set')
      ? conjReducerSet
      : throwError(`Unable to conj onto type ${getType(col)}. Must be type set or list`),
  col)

const get = (col, k, d) =>
  isType(col, 'list') || isType(col, 'set')
    ? col.get(k, d)
    : throwError(`Unable to get from type ${getType(col)}. Must be type set or list`)

module.exports = {
  conj,
  get,
  getDefault,
  getType,
  is,
  isForm,
  isList,
  isSet,
  isSym,
  makeBind,
  makeForm,
  makeLabel,
  makeList,
  makeQuote,
  makeSet,
  makeSym,
  sym,
  syms,
  throwError,
  toJS
}
