'use strict'

// Reduced protocol
const isReduced = x =>
  x instanceof Object && x['@@transducer/reduced'] === true

const unreduced = x =>
  isReduced(x)
    ? x['@@transducer/value']
    : x

const reduced = x =>
  isReduced(x)
    ? x
    : { '@@transducer/reduced': true, '@@transducer/value': x }

// Transformer protocol
const transformer = (obj) => ({
  '@@transducer/init': obj.init,
  '@@transducer/step': obj.step,
  '@@transducer/result': obj.result
})

const init = (t) => t['@@transducer/init']()
const step = (t, a, v) => t['@@transducer/step'](a, v)
const result = (t, a) => t['@@transducer/result'](a)

// Transducer functions
const final = x =>
  t => transformer({
    init: () => init(t),
    step: (a, v) => step(t, a, v),
    result: (a) => result(t, unreduced(step(t, a, x)))
  })

const multiplex = (xfs) =>
  t => {
    let ts = xfs.map(xf => xf(t))
    return transformer({
      init: () => init(t),
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
          return unreduced(a3)
        }
      },
      result: (a) => ts.reduce((a, t) => result(t, a), a)
    })
  }

const demultiplexTransformer = (state, t) =>
  // Warning: state is mutated by the transformer created in this function
  transformer({
    init: () => {
      state.running = true
      if (state.init == null) {
        state.init = init(t)
      }
      return state.init
    },
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
        if (state.refCount === 0 || state.reduced != null) {
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
      state = { running: false, refCount: 0 }
    }
    state.refCount += 1
    if (state.transformer == null) {
      state.transformer = demultiplexTransformer(state, xf(t))
    }
    return state.transformer
  }
}

module.exports = {
  isReduced,
  reduced,
  unreduced,

  final,
  multiplex,
  demultiplex
}
