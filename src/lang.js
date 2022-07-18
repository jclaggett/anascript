'use strict'

const im = require('immutable')

// Utils

const throwError = msg => {
  throw new Error(msg)
}

const toJS = x =>
  x instanceof im.Collection
    ? x.toJS()
    : x

// Language primitives
const identity = x => x

const compFlag = im.Record({}, 'complement')({})
const Sym = im.Record({ sym: null }, 'Sym')
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

const isComplement = x => x.contains(compFlag)

const isPos = x => x > 0
const isZero = x => x === 0
const isNeg = x => x < 0

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
  isComplement(x)
    ? x.remove(compFlag)
    : x.set(compFlag, compFlag)

const s = {
  all: (x, y) => x.merge(y),
  middle: (x, y) => x.deleteAll(x.deleteAll(y.keys()).keys()),
  left: (x, y) => x.deleteAll(y.keys()),
  right: (x, y) => s.left(y, x)
}

const cmdReducer = (a, b, c, d) =>
  (x, y) =>
    (isComplement(x)
      ? isComplement(y) ? a : b
      : isComplement(y) ? c : d)(x, y)

const difference = (...xs) =>
  xs.length === 0
    ? null
    : xs.length === 1
      ? complement(xs[0])
      : xs.reduce(cmdReducer(s.right, s.all, s.middle, s.left))

const union = (...xs) =>
  xs.length === 0
    ? makeSet()
    : xs.reduce(cmdReducer(s.middle, s.left, s.right, s.all))

const intersection = (...xs) =>
  xs.length === 0
    ? complement(makeSet())
    : xs.reduce(cmdReducer(s.all, s.right, s.left, s.middle))

const symmetricDifference = (...xs) =>
  xs.length === 0
    ? makeSet()
    : xs.reduce((x, y) => union(difference(x, y), difference(y, x)))

const everyKey = (a, f) =>
  a.keySeq().every(f)

const isSubset = (a, b) =>
  isComplement(a)
    ? isComplement(b)
      ? a.count() <= b.count() && everyKey(a, k => b.has(k))
      : a.count() <= b.count()
        ? everyKey(a, k => !b.has(k))
        : everyKey(b, k => !a.has(k))
    : isComplement(b)
      ? false
      : b.count() <= a.count() && everyKey(b, k => a.has(k))

const isSuperset = (a, b) =>
  isSubset(b, a)

const abs = x =>
  isSet(x)
    ? isComplement(x)
      ? complement(x)
      : x
    : isNumber(x)
      ? isNeg(x)
        ? -x
        : x
      : x

const bitNot = (...xs) =>
  xs.length === 0
    ? null
    : xs.length === 1
      ? ~xs[0]
      : xs.reduce((x, y) => x & ~y)

const bitOr = (...xs) =>
  xs.length === 0
    ? 0
    : xs.length === 1
      ? xs[0]
      : xs.reduce((x, y) => x | y)

const bitAnd = (...xs) =>
  xs.length === 0
    ? -1
    : xs.length === 1
      ? xs[0]
      : xs.reduce((x, y) => x & y)

const bitXor = (...xs) =>
  xs.length === 0
    ? 0
    : xs.length === 1
      ? xs[0]
      : xs.reduce((x, y) => x ^ y)

const keys = x =>
  (x === undefined)
    ? null // transducer here
    : isSet(x)
      ? makeSet(...x.keySeq().map(k => [k, k]))
      : isList(x)
        ? makeList(...x.keys())
        : null

module.exports = {
  abs,
  bitAnd,
  bitNot,
  bitOr,
  bitXor,
  complement,
  conj,
  difference,
  keys,
  getType,
  identity,
  intersection,
  is,
  isComplement,
  isFn,
  isForm,
  isList,
  isNeg,
  isNumber,
  isPos,
  isSet,
  isSubset,
  isSuperset,
  isSym,
  isZero,
  makeForm,
  makeList,
  makeSet,
  makeSym,
  sym,
  symmetricDifference,
  syms,
  throwError,
  toJS,
  union
}
