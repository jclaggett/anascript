// Reducer Protocol as described by:
// https://github.com/cognitect-labs/transducers-js#the-transducer-protocol
//
// This transducer implementation leverages prototype inheritance to provide
// default behavior for the new reducer by inheriting methods from of the old
// reducer. Reasons for this approach:
// 1. Prototype inheritance is a low level and optimized javascript feature.
// 2. The constructor doesn't define proxying INIT, STEP, and RESULT methods.

export const INIT = '@@transducer/init'
export const STEP = '@@transducer/step'
export const RESULT = '@@transducer/result'
export const REDUCED = '@@transducer/reduced'
export const VALUE = '@@transducer/value'

export const isReduced = (x) => x instanceof Object && x[REDUCED] === true
export const reduced = (x) => isReduced(x) ? x : { [REDUCED]: true, [VALUE]: x }
export const unreduced = (x) => isReduced(x) ? x[VALUE] : x

export const transducer = (constructor) =>
  (reducer) => {
    const reducer2 = constructor(reducer)
    return (reducer2 === reducer)
      ? reducer2
      : Object.setPrototypeOf(reducer2, reducer)
  }

// A reduce function that stops when receiving a reduced value.
const reduce = (f, a, vs) => {
  for (const v of vs) {
    a = f(a, v)
    if (isReduced(a)) break
  }
  return a
}

// Like reduce but with a transducer instead of an f
export const transduce = (r, a, vs) =>
  r[RESULT](unreduced(reduce(r[STEP], a, vs)))

export const ezducer = (constructor) => {
  return transducer(r => {
    const { step, result } = {
      step: (v) => [v],
      result: () => [],
      ...constructor()
    }
    const rstep = (a, vs) =>
      reduce(
        (a, v) => v === reduced
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

// reducers

export const nullReducer = {
  [INIT]: () => null,
  [STEP]: (a, _x) => a,
  [RESULT]: (a) => a
}

export const toArray = {
  [INIT]: () => [],
  [STEP]: (a, x) => {
    a.push(x)
    return a
  },
  [RESULT]: (a) => a
}

export const count = {
  [INIT]: () => 0,
  [STEP]: (a, _x) => a + 1,
  [RESULT]: (a) => a
}

export const average = {
  [INIT]: () => ({ total: 0, count: 0 }),
  [STEP]: (a, x) => {
    a.total += x
    a.count += 1
    return a
  },
  [RESULT]: (a) => a.total / a.count
}
