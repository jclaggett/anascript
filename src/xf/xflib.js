// Library of transducers. The only rule for inclusion is that these
// transducers may be composed freely and don't export non-transducer
// functions. This is why the joining transducers are excluded.

const { compose, filter, map, takeWhile } = require('transducist')

const {
  transformer, step, result, isReduced, reduced, unreduced
} = require('./reducing')
const { first, second } = require('./util')

// remap: map f over each value and the results of the previous mapping.
const remap = (f, initialValue) =>
  (t) => {
    let state = initialValue
    return transformer(t, {
      step: (a, v) => {
        state = f(state, v)
        return step(t, a, state)
      }
    })
  }

// prolog & epilog: step an initial value before first step and a final value
// after last step.

const prolog = (x) =>
  (t) => {
    let prologNeverEmitted = true
    return transformer(t, {
      step: (a, v) => {
        if (prologNeverEmitted) {
          prologNeverEmitted = false
          const a2 = step(t, a, x)
          if (isReduced(a2)) {
            return a2
          } else {
            return step(t, a2, v)
          }
        } else {
          return step(t, a, v)
        }
      },
      result: (a) => {
        if (prologNeverEmitted) {
          prologNeverEmitted = false
          return result(t, unreduced(step(t, a, x)))
        } else {
          return result(t, a)
        }
      }
    })
  }

const epilog = (x) =>
  (t) => transformer(t, {
    result: (a) => result(t, unreduced(step(t, a, x)))
  })

// dropAll & after: ignore all steps and send a single value at end.

const dropAll =
  (t) => transformer(t, {
    step: (a, _v) => a
  })

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
  // There are 4 layers of tranformers in multiplex:
  // t1: the given, following transformer in the chain
  // t2: a demultiplex transformer to allow sharing of t1
  // ts: the transformers corresponding to the multiplexed transducers
  // returned: the multiplex transformer that handles `step` and `result`
  (t1) => {
    const t2 = demultiplexTransformer(t1, { refCount: xfs.length })
    let ts = xfs.map(xf => xf(t2))
    return transformer(t1, {
      step: (a, v) => {
        const a3 = ts.reduce(
          (a, t, i) => {
            const a2 = step(t, a, v)
            if (isReduced(a2)) {
              ts[i] = null // Remove t from ts
              return result(t, unreduced(a2))
            } else {
              return a2
            }
          },
          a)
        ts = ts.filter(x => x != null)
        if (ts.length === 0) {
          return reduced(a3)
        } else {
          return a3
        }
      },
      result: (a) => ts.reduce((a, t) => result(t, a), a)
    })
  }

const demultiplexTransformer = (t, state) =>
  // Warning: state is mutated by the transformer created in this function
  transformer(t, {
    step: (a, v) => {
      state.running = true
      if (state.reduced == null) {
        const a2 = step(t, a, v)
        if (isReduced(a2)) {
          state.reduced = a2
        }
        return a2
      } else {
        return state.reduced
      }
    },
    result: (a) => {
      state.running = true
      if (state.result == null) {
        state.refCount -= 1
        if (state.refCount <= 0 || state.reduced != null) {
          state.result = result(t, a)
          return state.result
        } else {
          return a
        }
      } else {
        return state.result
      }
    }
  })

const demultiplex = (xf) => {
  // Shared, mutable state across multiple calls to the transducer.
  // This makes this function not thread safe.
  let state = { running: true }
  return t => {
    if (state.running) {
      state = { running: false, refCount: 0, transformer: null }
    }
    state.refCount += 1
    if (state.transformer == null) {
      state.transformer = demultiplexTransformer(xf(t), state)
    }
    return state.transformer
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
