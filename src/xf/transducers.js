'use strict'

// Reduced protocol
const treduced = '@@transducer/reduced'
const tvalue = '@@transducer/value'

const isReduced = x =>
  x instanceof Object && x[treduced] === true

const unreduced = x =>
  isReduced(x)
    ? x[tvalue]
    : x

const reduced = x =>
  isReduced(x)
    ? x
    : { [treduced]: true, [tvalue]: x }

// Transformer protocol
const tinit = '@@transducer/init'
const tresult = '@@transducer/result'
const tstep = '@@transducer/step'

const transformer = (init, step, result) =>
  ({ [tinit]: init, [tstep]: step, [tresult]: result })

// Transducer functions
const final = x =>
  t => transformer(
    () => t[tinit](),
    (a, v) => t[tstep](a, v),
    (a) => t[tresult](unreduced(t[tstep](a, x))))

const multiplex = (xfs) =>
  t => {
    let ts = xfs.map(xf => xf(t))
    return transformer(
      () => t[tinit](),
      (a, v) => {
        const a3 = ts.reduce(
          (a, t, i) => {
            const a2 = t[tstep](a, v)
            if (isReduced(a2)) {
              ts[i] = null // Remove t from ts
              return t[tresult](unreduced(a2))
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
      (a) => ts.reduce((a, t) => t[tresult](a), a))
  }

module.exports = {
  isReduced,
  reduced,
  unreduced,

  final,
  multiplex
}
