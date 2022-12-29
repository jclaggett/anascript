// Reducer Protocol as described by:
// https://github.com/cognitect-labs/transducers-js#the-transducer-protocol
//
// This transducer implementation leverages prototype inheritance to provide
// default behavior for the new reducer by inheriting methods from of the old
// reducer. Reasons for this approach:
// 1. Prototype inheritance is a low level and optimized javascript feature.
// 2. The constructor doesn't define proxying INIT, STEP, and RESULT methods.

const INIT = '@@transducer/init'
const STEP = '@@transducer/step'
const RESULT = '@@transducer/result'
const REDUCED = '@@transducer/reduced'
const VALUE = '@@transducer/value'

const isReduced = (x) => x instanceof Object && x[REDUCED] === true
const reduced = (x) => isReduced(x) ? x : { [REDUCED]: true, [VALUE]: x }
const unreduced = (x) => isReduced(x) ? x[VALUE] : x

const transducer = (constructor) =>
  (reducer) => {
    const reducer2 = constructor(reducer)
    if (reducer2 === reducer) {
      return reducer2
    } else {
      return Object.setPrototypeOf(reducer2, reducer)
    }
  }

const EOT = Symbol('EOT')

// A reduce function that stops when receiving a reduced value.
const reduce = (f, a, vs) => {
  for (const v of vs) {
    a = f(a, v)
    if (isReduced(a)) break
  }
  return a
}

const ezducer = (step = (v) => [v], result = () => []) => {
  return transducer(r => {
    const rstep = (a, vs) =>
      reduce(
        (a, v) => v === EOT
          ? reduced(a)
          : r[STEP](a, v),
        a,
        vs)
    return {
      [STEP]: (a, v) => rstep(a, step(v)),
      [RESULT]: (a) => r[RESULT](unreduced(rstep(a, result())))
    }
  })
}

module.exports = {
  INIT,
  STEP,
  RESULT,
  isReduced,
  unreduced,
  reduced,
  transducer,

  EOT,
  ezducer
}
