// Library of transducers. The only rule for inclusion is that these
// transducers may be composed freely and don't export non-transducer
// functions. This is why the joining transducers are excluded.

const { compose, filter, map, takeWhile } = require('transducist')

const {
  STEP, RESULT,
  transducer, isReduced, reduced, unreduced
} = require('./reducing')
const { identity, first, second } = require('./util')

// remap: map f over each value and the results of the previous mapping.
const remap = (f, initialValue) =>
  transducer(reducer => {
    let state = initialValue
    return {
      [STEP]: (a, v) => {
        state = f(state, v)
        return reducer[STEP](a, state)
      }
    }
  })

// prolog & epilog: step an initial value before first step and a final value
// after last step.

const prolog = (x) =>
  transducer(r => {
    let prologNeverEmitted = true
    return {
      [STEP]: (a, v) => {
        if (prologNeverEmitted) {
          prologNeverEmitted = false
          const a2 = r[STEP](a, x)
          if (isReduced(a2)) {
            return a2
          } else {
            return r[STEP](a2, v)
          }
        } else {
          return r[STEP](a, v)
        }
      },
      [RESULT]: (a) => {
        if (prologNeverEmitted) {
          prologNeverEmitted = false
          return r[RESULT](unreduced(r[STEP](a, x)))
        } else {
          return r[RESULT](a)
        }
      }
    }
  })

const epilog = (x) =>
  transducer(r => ({
    [RESULT]: (a) => r[RESULT](unreduced(r[STEP](a, x)))
  }))

// dropAll & after: ignore all steps and send a single value at end.

const dropAll =
  transducer(_r => ({
    [STEP]: (a, _v) => a
  }))

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
  if (n === 1) {
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
  demultiplex,
  detag,
  epilog,
  dropAll,
  multiplex,
  prolog,
  remap,
  tag
}
