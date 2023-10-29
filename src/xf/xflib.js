// Library of transducers. The only rule for inclusion is that these
// transducers may be composed freely and don't export non-transducer
// functions. This is why the joining transducers are excluded.

import {
  STEP, RESULT,
  transducer, isReduced, reduced, unreduced, reduce
} from './reducing.js'
import { compose, identity, first, second } from './util.js'

// flatMap: call `f` with current value and stepping through all returned values
export const flatMap = (f) =>
  transducer(r => ({
    [STEP]: (a, v) => reduce(r[STEP], a, f(v))
  }))

// map: call `f` with current value and stepping through returned value
export const map = (f) =>
  transducer(r => ({
    [STEP]: (a, v) => r[STEP](a, f(v))
  }))

// emit: constantly return x for every step
export const emit = (x) =>
  map(_ => x)

export const reductions = (f, initialValue) =>
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
export const filter = (pred) =>
  transducer(r => ({
    [STEP]: (a, v) => pred(v)
      ? r[STEP](a, v)
      : a
  }))

// partition: Step width sized groups of values and every stride.
export const partition = (width, stride) =>
  transducer(r => {
    width = width < 0 ? 0 : width
    stride = stride < 1 ? 1 : stride
    let i = stride - width - 1
    let vs = []
    return {
      [STEP]: (a, v) => {
        i = (i + 1) % stride
        if (i >= (stride - width)) {
          vs.push(v)
          if (vs.length === width) {
            a = r[STEP](a, vs)
            vs = vs.slice(stride)
          }
        }
        return a
      }
    }
  })

// trailing: step an array of the previous n values
export const trailing = (n) =>
  transducer(r => {
    const buffer = []
    return {
      [STEP]: (a, v) => {
        buffer.push(v)
        if (buffer.length > n) {
          buffer.shift()
        }
        return r[STEP](a, [...buffer])
      }
    }
  })

// filter2: Step if `pred(previous, v)` is true. Always step through first value.
export const filter2 = (pred) =>
  transducer(r => {
    const initialValue = Symbol('init')
    let previous = initialValue
    return {
      [STEP]: (a, v) => {
        if (previous === initialValue || pred(previous, v)) {
          a = r[STEP](a, v)
          previous = v
        }
        return a
      }
    }
  })

// dedupe: Step if the current value is different from the previous value.
export const dedupe = () =>
  filter2((x, y) => x !== y)

// dropAll: ignore all steps
export const dropAll =
  transducer(_ => ({
    [STEP]: (a, _) => a
  }))

// take: only step `n` times.
export const take = (n) =>
  (n < 1)
    ? dropAll
    : transducer(r => {
      let i = n
      return {
        [STEP]: (a, v) =>
          ((--i < 1) ? reduced : identity)(r[STEP](a, v))
      }
    })

// takeWhile: only step through while `pred(v)` is true.
export const takeWhile = (pred) =>
  transducer(r => ({
    [STEP]: (a, v) =>
      pred(v)
        ? r[STEP](a, v)
        : reduced(a)
  }))

// drop: do not step `n` times.
export const drop = (n) =>
  (n < 1)
    ? identity
    : transducer(r => {
      let i = n
      return {
        [STEP]: (a, v) => (--i < 0)
          ? r[STEP](a, v)
          : a
      }
    })

// dropWhile: do not step until `pred(v)` is false.
export const dropWhile = (pred) =>
  transducer(r => {
    let stillDropping = true
    return {
      [STEP]: (a, v) => {
        stillDropping = stillDropping && pred(v)
        return stillDropping ? a : r[STEP](a, v)
      }
    }
  })

// prolog & epilog: step an initial value before first step and a final value
// after last step.
export const prolog = (x) =>
  transducer(r => {
    let stepNeverCalled = true
    return {
      [STEP]: (a, v) => {
        if (stepNeverCalled) {
          stepNeverCalled = false
          a = r[STEP](a, x)
        }
        return isReduced(a)
          ? a
          : r[STEP](a, v)
      },
      [RESULT]: (a) =>
        r[RESULT](stepNeverCalled ? unreduced(r[STEP](a, x)) : a)
    }
  })

export const epilog = (x) =>
  transducer(r => {
    let stepWasReduced = false
    return {
      [STEP]: (a, v) => {
        a = r[STEP](a, v)
        stepWasReduced = isReduced(a)
        return a
      },
      [RESULT]: (a) =>
        r[RESULT](stepWasReduced ? a : unreduced(r[STEP](a, x)))
    }
  })

// after: step `x` after dropping all values.
export const after = (x) =>
  compose(
    dropAll,
    epilog(x))

// tag & detag tranducers
export const tag = (k) =>
  compose(
    map(x => [k, x]),
    epilog([k]))

export const detag = (k) =>
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
export const multiplex = (xfs) =>
  // There are 4 layers of reducers in multiplex:
  // r1: the given, next reducer in the chain
  // r2: a demultiplex reducer over r1
  // rs: the muliplexed reducers all sharing r2
  // returned reducer: applies all rs reducers
  (xfs.length === 0)
    ? identity // trivial case: zero transducers to multiplex
    : (xfs.length === 1)
        ? xfs[0] // trivial case: no need to multiplex one transducer
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

export const demultiplex = (n) => {
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
