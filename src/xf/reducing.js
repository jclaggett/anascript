// Reducer Protocol as described by:
// https://github.com/cognitect-labs/transducers-js#the-transducer-protocol

const INIT = '@@transducer/init'
const STEP = '@@transducer/step'
const RESULT = '@@transducer/result'
const REDUCED = '@@transducer/reduced'
const VALUE = '@@transducer/value'

const isReduced = (x) => x instanceof Object && x[REDUCED] === true
const reduced = (x) => isReduced(x) ? x : { [REDUCED]: true, [VALUE]: x }
const unreduced = (x) => isReduced(x) ? x[VALUE] : x

// This transducer implementation leverages prototype inheritance to provide
// default behavior for the new reducer by inheriting methods from of the old
// reducer. Reasons for this approach:
// 1. Protoype inheritance is a low level and optimized javascript feature.
// 2. The constructor doesn't define wrapper INIT, STEP, and RESULT methods.
const transducer = (constructor) =>
  (reducer) =>
    Object.setPrototypeOf(
      constructor(reducer),
      reducer)

module.exports = {
  INIT,
  STEP,
  RESULT,
  isReduced,
  unreduced,
  reduced,
  transducer
}
