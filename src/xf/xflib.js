// Library of transducers. The only rule for inclusion is that these
// transducers may be composed freely and don't export non-transducer
// functions. This is why the joining transducers are excluded.

const {
  STEP, RESULT,
  transducer, isReduced, reduced, unreduced
} = require('./reducing')
const { compose, identity, first, second } = require('./util')

// map: call `f` with current value.
const map = (f) =>
  transducer(r => {
    return {
      [STEP]: (a, v) => {
        return r[STEP](a, f(v))
      }
    }
  })

// reductions: call `f` with the previous results (or initialValue) and the
// current value.
const reductions = (f, initialValue) =>
  transducer(r => {
    let state = initialValue
    return {
      [STEP]: (a, v) => {
        state = f(state, v)
        return r[STEP](a, state)
      }
    }
  })

// filter: Step only if `pred(v)` is true.
const filter = (pred) =>
  transducer(r => {
    return {
      [STEP]: (a, v) => {
        if (pred(v)) {
          a = r[STEP](a, v)
        }
        return a
      }
    }
  })

// filter2: Step if `pred(previous, v)` is true. Always step on first value.
const filter2 = (pred) =>
  transducer(r => {
    const initialValue = {}
    let previous = initialValue
    return {
      [STEP]: (a, v) => {
        if (previous === initialValue || pred(previous, v)) {
          previous = v
          a = r[STEP](a, v)
        }
        return a
      }
    }
  })

// dedupe: Step if the current value is different from the previous value.
const dedupe = () =>
  filter2((x, y) => x !== y)

// dropAll & after: ignore all steps and send a single value at end.
const dropAll =
  transducer(_r => ({
    [STEP]: (a, _v) => a
  }))

// take: only step `n` times.
const take = (n) =>
  (n < 1)
    ? dropAll
    : transducer(r => {
      return {
        [STEP]: (a, v) => {
          a = r[STEP](a, v)
          if (--n < 1) {
            a = reduced(a)
          }
          return a
        }
      }
    })

// takeWhile: only step through while `pred(v)` is true.
const takeWhile = (pred) =>
  transducer(r => {
    return {
      [STEP]: (a, v) => {
        if (pred(v)) {
          a = r[STEP](a, v)
        } else {
          a = reduced(a)
        }
        return a
      }
    }
  })

// drop: do not step `n` times.
const drop = (n) =>
  (n < 1)
    ? identity
    : transducer(r => {
      return {
        [STEP]: (a, v) => {
          if (n-- < 1) {
            a = r[STEP](a, v)
          }
          return a
        }
      }
    })

// dropWhile: do not step until `pred(v)` is false.
const dropWhile = (pred) =>
  transducer(r => {
    let stillDropping = true
    return {
      [STEP]: (a, v) => {
        if (stillDropping) {
          stillDropping = pred(v)
          if (!stillDropping) {
            a = r[STEP](a, v)
          }
        } else {
          a = r[STEP](a, v)
        }
        return a
      }
    }
  })

// prolog & epilog: step an initial value before first step and a final value
// after last step.
const prolog = (x) =>
  transducer(r => {
    let stepNeverCalled = true
    return {
      [STEP]: (a, v) => {
        if (stepNeverCalled) {
          stepNeverCalled = false
          a = r[STEP](a, x)
          if (!isReduced(a)) {
            a = r[STEP](a, v)
          }
        } else {
          a = r[STEP](a, v)
        }
        return a
      },

      [RESULT]: (a) => {
        if (stepNeverCalled) {
          a = unreduced(r[STEP](a, x))
        }
        return r[RESULT](a)
      }
    }
  })

const epilog = (x) =>
  transducer(r => ({
    [RESULT]: (a) => r[RESULT](unreduced(r[STEP](a, x)))
  }))

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
  map,
  multiplex,
  prolog,
  reductions,
  tag,
  take,
  takeWhile
}
