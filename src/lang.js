import im from 'immutable'

// Utils

export const throwError = msg => {
  throw new Error(msg)
}

export const toJS = x =>
  x instanceof im.Collection
    ? x.toJS()
    : x

// Language primitives
export const identity = x => x

const compFlag = im.Record({}, 'complement')({})
const Sym = im.Record({ sym: null }, 'Sym')
export const makeSym = sym => Sym({ sym })

export const syms = { env: makeSym('env') }
export const sym = name => {
  if (!(name in syms)) {
    syms[name] = makeSym(name)
  }
  return syms[name]
}

export const makeSet = (...xs) => im.Map(xs)
export const makeList = (...xs) => im.List(xs)
export const makeForm = (name, ...args) => makeList(sym(name), ...args)

export const is = im.is
export const isSym = x => x instanceof Sym
export const isList = x => im.List.isList(x)
export const isSet = x => im.Map.isMap(x)
export const isFn = x => typeof x === 'function'
export const isForm = (x, ...names) =>
  isList(x) && names.some(name => is(x.first(), sym(name)))
export const isNumber = x => typeof x === 'number'

export const isComplement = x => x.contains(compFlag)

export const isPos = x => x > 0
export const isZero = x => x === 0
export const isNeg = x => x < 0

export const getType = x =>
  isSet(x)
    ? 'set'
    : isSym(x)
      ? 'symbol'
      : isList(x)
        ? 'list'
        : typeof x

class ConjCollection {
  constructor (col) {
    this.col = col
    this.push = isList(col)
      ? this.pushList
      : isSet(col)
        ? this.pushSet
        : throwError(`Unable to conj onto type ${getType(col)}. Must be type set or list`)
    this.pushIndex = col.count()
  }

  set (k, v) {
    this.col = ((isList(this.col) && !isNumber(k))
      ? this.col.toMap()
      : this.col)
      .set(k, v)
    return this
  }

  pushList (v) {
    this.col = this.col.set(this.pushIndex++, v)
    return this
  }

  pushSet (v) {
    this.col = this.col.set(v, v)
    return this
  }
}

const conjReducer = (col, x) =>
  isForm(x, 'bind')
    ? col.set(x.get(1), x.get(2))
    : isForm(x, 'binds')
      ? x.rest().reduce(conjReducer, col)
      : isForm(x, 'spread')
        ? isList(x.get(1))
          ? x.get(1)
            .reduce(conjReducer, col)
          : x.get(1)
            .map((v, k) => makeForm('bind', k, v))
            .reduce(conjReducer, col)
        : col.push(x)

export const conj = (col, ...xs) =>
  xs.reduce(conjReducer, new ConjCollection(col))
    .col

export const complement = x =>
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

export const difference = (...xs) =>
  xs.length === 0
    ? null
    : xs.length === 1
      ? complement(xs[0])
      : xs.reduce(cmdReducer(s.right, s.all, s.middle, s.left))

export const union = (...xs) =>
  xs.length === 0
    ? makeSet()
    : xs.reduce(cmdReducer(s.middle, s.left, s.right, s.all))

export const intersection = (...xs) =>
  xs.length === 0
    ? complement(makeSet())
    : xs.reduce(cmdReducer(s.all, s.right, s.left, s.middle))

const everyKey = (a, f) =>
  a.keySeq().every(f)

export const isSubset = (a, b) =>
  isComplement(a)
    ? isComplement(b)
      ? a.count() <= b.count() && everyKey(a, k => b.has(k))
      : a.count() <= b.count()
        ? everyKey(a, k => !b.has(k))
        : everyKey(b, k => !a.has(k))
    : isComplement(b)
      ? false
      : b.count() <= a.count() && everyKey(b, k => a.has(k))

export const isSuperset = (a, b) =>
  isSubset(b, a)

export const abs = x =>
  isSet(x)
    ? isComplement(x)
      ? complement(x)
      : x
    : isNumber(x)
      ? isNeg(x)
        ? -x
        : x
      : x

export const bitNot = (...xs) =>
  xs.length === 0
    ? null
    : xs.length === 1
      ? ~xs[0]
      : xs.reduce((x, y) => x & ~y)

export const bitOr = (...xs) =>
  xs.length === 0
    ? 0
    : xs.length === 1
      ? xs[0]
      : xs.reduce((x, y) => x | y)

export const bitAnd = (...xs) =>
  xs.length === 0
    ? -1
    : xs.length === 1
      ? xs[0]
      : xs.reduce((x, y) => x & y)

export const bitXor = (...xs) =>
  xs.length === 0
    ? 0
    : xs.length === 1
      ? xs[0]
      : xs.reduce((x, y) => x ^ y)

export const keys = x =>
  (x === undefined)
    ? null // transducer here
    : isSet(x)
      ? makeSet(...x.keySeq().map(k => [k, k]))
      : isList(x)
        ? makeList(...x.keys())
        : null
