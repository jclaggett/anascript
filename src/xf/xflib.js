// Library of transducers. The only rule for inclusion is that these
// transducers may be composed freely and don't export non-transducer
// functions. This is why the joining transducers are excluded.

import {
  STEP, RESULT,
  transducer, isReduced, reduced, unreduced,
  ezducer
} from './reducing.js'
import { compose, identity, first, second } from './util.js'

// flatMap: call `step` with current value.
export const flatMap = (step) =>
  ezducer(() => ({ step }))

// map: call `f` with current value.
export const map = (f) =>
  flatMap(v => [f(v)])

// emit: constantly return x for every step
export const emit = (x) =>
  map((_v) => x)

// reductions: call `f` with the previous results (or initialValue) and the
// current value.
export const reductions = (f, initialValue) => {
  let state = initialValue
  return ezducer(() => ({
    step: (v) => {
      state = f(state, v)
      return [state]
    }
  }))
}

// filter: Step only if `pred(v)` is true.
export const filter = (pred) =>
  ezducer(() => ({ step: (v) => pred(v) ? [v] : [] }))

// partition: Step width sized groups of values and every stride.
export const partition = (width, stride) => {
  stride = stride < 1 ? 1 : stride
  return ezducer(() => {
    let i = stride - width - 1
    let group = []
    return {
      step: (v) => {
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
      }
    }
  })
}

// filter2: Step if `pred(previous, v)` is true. Always step on first value.
export const filter2 = (pred) =>
  ezducer(() => {
    const initialValue = Symbol('init')
    let previous = initialValue
    return {
      step: (v) => {
        const result = []
        if (previous === initialValue || pred(previous, v)) {
          previous = v
          result.push(v)
        }
        return result
      }
    }
  })

// dedupe: Step if the current value is different from the previous value.
export const dedupe = () =>
  filter2((x, y) => x !== y)

// dropAll & after: ignore all steps and send a single value at end.
export const dropAll =
  ezducer(() => ({ step: (_v) => [] }))

// take: only step `n` times.
export const take = (n) =>
  (n < 1)
    ? dropAll
    : ezducer(() => {
      let i = n
      return { step: (v) => (--i < 1) ? [v, reduced] : [v] }
    })

// takeWhile: only step through while `pred(v)` is true.
export const takeWhile = (pred) =>
  ezducer(() => ({ step: (v) => [pred(v) ? v : reduced] }))

// drop: do not step `n` times.
export const drop = (n) =>
  (n < 1)
    ? identity
    : ezducer(() => {
      let i = n
      return { step: (v) => (--i < 0) ? [v] : [] }
    })

// dropWhile: do not step until `pred(v)` is false.
export const dropWhile = (pred) =>
  ezducer(() => {
    let stillDropping = true
    return {
      step: (v) => {
        if (stillDropping) {
          stillDropping = pred(v)
        }
        return stillDropping ? [] : [v]
      }
    }
  })

// prolog & epilog: step an initial value before first step and a final value
// after last step.
export const prolog = (x) =>
  ezducer(() => {
    let stepNeverCalled = true
    return {
      step: (v) => {
        const result = []
        if (stepNeverCalled) {
          stepNeverCalled = false
          result.push(x)
        }
        result.push(v)
        return result
      },

      result: () => stepNeverCalled ? [x] : []
    }
  })

export const epilog = (x) =>
  ezducer(() => ({
    result: () => [x]
  }))

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
