// Library of transducers. The only rule for inclusion is that these
// transducers may be composed freely and don't export non-transducer
// functions. This is why the joining transducers are excluded.

const {
  STEP, RESULT,
  transducer, isReduced, reduced, unreduced,
  ezducer, EOT
} = require('./reducing')
const { compose, identity, first, second } = require('./util')

// flatMap: call `step` with current value.
const flatMap = (f) =>
  ezducer(f)

// map: call `f` with current value.
const map = (f) =>
  ezducer((v) => [f(v)])

// reductions: call `f` with the previous results (or initialValue) and the
// current value.
const reductions = (f, initialValue) => {
  let state = initialValue
  return ezducer(
    (v) => {
      state = f(state, v)
      return [state]
    })
}

// filter: Step only if `pred(v)` is true.
const filter = (pred) =>
  ezducer((v) => pred(v) ? [v] : [])

// partition: Step width sized groups of values and every stride.
const partition = (width, stride) => {
  stride = stride < 1 ? 1 : stride
  let i = stride - width - 1
  let group = []
  return ezducer((v) => {
    const result = []
    i = (i + 1) % stride
    if (i >= (stride - width)) {
      group.push(v)
      if (group.length === width) {
        result.push(group)
        group = group.slice(stride)
      }
    }
    return result
  })
}

// filter2: Step if `pred(previous, v)` is true. Always step on first value.
const filter2 = (pred) => {
  const initialValue = Symbol('init')
  let previous = initialValue
  return ezducer((v) => {
    const result = []
    if (previous === initialValue || pred(previous, v)) {
      previous = v
      result.push(v)
    }
    return result
  })
}

// dedupe: Step if the current value is different from the previous value.
const dedupe = () =>
  filter2((x, y) => x !== y)

// dropAll & after: ignore all steps and send a single value at end.
const dropAll =
  ezducer((_v) => [])

// take: only step `n` times.
const take = (n) =>
  (n < 1)
    ? dropAll
    : ezducer((v) =>
      (--n < 1)
        ? [v, EOT]
        : [v])

// takeWhile: only step through while `pred(v)` is true.
const takeWhile = (pred) =>
  ezducer((v) => [pred(v) ? v : EOT])

// drop: do not step `n` times.
const drop = (n) =>
  (n < 1)
    ? identity
    : ezducer((v) => (--n < 0) ? [v] : [])

// dropWhile: do not step until `pred(v)` is false.
const dropWhile = (pred) => {
  let stillDropping = true
  return ezducer((v) => {
    if (stillDropping) {
      stillDropping = pred(v)
    }
    return stillDropping ? [] : [v]
  })
}

// prolog & epilog: step an initial value before first step and a final value
// after last step.
const prolog = (x) => {
  let stepNeverCalled = true
  return ezducer(
    (v) => {
      const result = []
      if (stepNeverCalled) {
        stepNeverCalled = false
        result.push(x)
      }
      result.push(v)
      return result
    },

    () => stepNeverCalled ? [x] : [])
}

const epilog = (x) =>
  ezducer(undefined, () => [x])

// epilog: step `x` after dropping all values.
const after = (x) =>
  compose(
    dropAll,
    epilog(x))

// tag & detag tranducers
const tag = (k) =>
  compose(
    map(x => [k, x]),
    epilog([k]))

const detag = (k) =>
  compose(
    filter(x => x instanceof Array && x.length > 0 && first(x) === k),
    takeWhile(x => x.length === 2),
    map(second))

// multiplex & demultiplex tranducers
// NOTE: these are both 'higher order' transducers and so ezducer is not
// sufficient. Instead, these are written using the underlying transducer fn.
// NOTE: demultiplex assumes that the standard reducing protocol is broken! It
// assumes that, instead of only one parent transducer, it may have multiple
// (n) parent transducers. This means it will accept [STEP] calls even after a
// reduced() value is returned and it expects to receive multiple (n) [RESULT]
// calls.
const multiplex = (xfs) =>
  // There are 4 layers of reducers in multiplex:
  // r1: the given, next reducer in the chain
  // r2: a demultiplex reducer over r1
  // rs: the muliplexed reducers all sharing r2
  // returned reducer: applies all rs reducers
  (xfs.length === 1)
    ? xfs[0] // trivial case
    : transducer(r1 => {
      const r2 = demultiplex(xfs.length)(r1)
      let rs = xfs.map(xf => xf(r2))
      return {
        [STEP]: (a, v) => {
          a = rs.reduce(
            (a, r, i) => {
              a = r[STEP](a, v)
              if (isReduced(a)) {
                rs[i] = null
                a = r[RESULT](unreduced(a))
              }
              return a
            },
            a)
          rs = rs.filter(x => x != null)
          if (rs.length === 0) {
            a = reduced(a)
          }
          return a
        },

        [RESULT]: (a) =>
          rs.reduce((a, r) => r[RESULT](a), a)
      }
    })

const demultiplex = (n) => {
  if (n < 2) {
    return identity // trivial case
  } else {
    let expectedResultCalls = n
    let sharedReducer = null
    let reducedValue = null
    return transducer(r => {
      if (sharedReducer == null) {
        sharedReducer = {
          [STEP]: (a, v) => {
            if (reducedValue != null) {
              a = reducedValue
            } else {
              a = r[STEP](a, v)
              if (isReduced(a)) {
                reducedValue = a
              }
            }
            return a
          },

          [RESULT]: (a) => {
            if (--expectedResultCalls <= 0) {
              a = r[RESULT](a)
            }
            return a
          }
        }
      }
      return sharedReducer
    })
  }
}

module.exports = {
  after,
  dedupe,
  demultiplex,
  detag,
  drop,
  dropAll,
  dropWhile,
  epilog,
  filter,
  filter2,
  flatMap,
  map,
  multiplex,
  partition,
  prolog,
  reductions,
  tag,
  take,
  takeWhile
}
