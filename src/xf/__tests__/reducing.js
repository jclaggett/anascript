// Rules for this file
// 1. Coverage report should be at 100% when testing only this file.
// 2. Tests should be defined only in terms of the exported API.

import {
  INIT, STEP, RESULT, isReduced, unreduced, reduced, transducer,
  transduce, nullReducer, count, toArray, average,
  asReduced, asUnreduced
} from '../reducing'

test('reducing fns work', () => {
  expect(isReduced(42))
    .toStrictEqual(false)
  expect(isReduced(reduced(42)))
    .toStrictEqual(true)
  expect(isReduced(asReduced(42)))
    .toStrictEqual(true)
  expect(isReduced(asReduced(reduced(42))))
    .toStrictEqual(true)
  expect(isReduced(unreduced(asReduced(reduced(42)))))
    .toStrictEqual(false)
  expect(isReduced(asUnreduced(asReduced(reduced(42)))))
    .toStrictEqual(false)
  expect(isReduced(asUnreduced(unreduced(asReduced(reduced(42))))))
    .toStrictEqual(false)
})

test('transducing fn works', () => {
  const xf = transducer(r => ({
    [INIT]: r[INIT],
    [STEP]: r[STEP],
    [RESULT]: r[RESULT]
  }))

  const r1 = {
    [INIT]: () => 0,
    [STEP]: (a, v) => a + v,
    [RESULT]: (a) => a
  }

  const r2 = xf(r1)

  expect(r2[INIT]())
    .toStrictEqual(0)
  expect(r2[STEP](0, 1))
    .toStrictEqual(1)
  expect(r2[RESULT](1))
    .toStrictEqual(1)

  expect(transducer(r => r)(r1))
    .toBe(r1)
})

test('reducers work', () => {
  const data = [1, 2, 3]
  expect(transduce(nullReducer, nullReducer[INIT](), data))
    .toStrictEqual(null)
  expect(transduce(toArray, toArray[INIT](), data))
    .toStrictEqual([1, 2, 3])
  expect(transduce(count, count[INIT](), data))
    .toStrictEqual(3)
  expect(transduce(average, average[INIT](), data))
    .toStrictEqual(2)
})
