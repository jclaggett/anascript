// Library of transducers. The only rule for inclusion is that these
// transducers may be composed freely and don't export non-transducer
// functions. This is why the joining transducers are excluded.

const { compose, filter, map, takeWhile } = require('transducist')

const {
  STEP, RESULT,
  transducer, isReduced, reduced, unreduced
} = require('./reducing')
const { first, second } = require('./util')

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
  transducer(r1 => {
    const r2 = demultiplexReducer(r1, { refCount: xfs.length })
    let rs = xfs.map(xf => xf(r2))
    return {
      [STEP]: (a, v) => {
        const a3 = rs.reduce(
          (a, r, i) => {
            const a2 = r[STEP](a, v)
            if (isReduced(a2)) {
              rs[i] = null
              return r[RESULT](unreduced(a2))
            } else {
              return a2
            }
          },
          a)
        rs = rs.filter(x => x != null)
        if (rs.length === 0) {
          return reduced(a3)
        } else {
          return a3
        }
      },

      [RESULT]: (a) => rs.reduce((a, r) => r[RESULT](a), a)
    }
  })

const demultiplexReducer = (r, state) =>
  transducer(r => ({
    [STEP]: (a, v) => {
      state.running = true
      if (state.reduced == null) {
        const a2 = r[STEP](a, v)
        if (isReduced(a2)) {
          state.reduced = a2
        }
        return a2
      } else {
        return state.reduced
      }
    },
    [RESULT]: (a) => {
      state.running = true
      if (state.result == null) {
        state.refCount -= 1
        if (state.refCount <= 0 || state.reduced != null) {
          state.result = r[RESULT](a)
          return state.result
        } else {
          return a
        }
      } else {
        return state.result
      }
    }
  }))(r)

const demultiplex = (xf) => {
  // Shared, mutable state across multiple calls to the transducer.
  // This makes this function not thread safe.
  let state = { running: true }
  return transducer(r => {
    if (state.running) {
      state = { running: false, refCount: 0, reducer: null }
    }
    state.refCount += 1
    if (state.reducer == null) {
      state.reducer = demultiplexReducer(xf(r), state)
    }
    return state.reducer
  })
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
