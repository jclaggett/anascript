// Rules for this file
// 1. Coverage report should be at 100% when testing only this file.
// 2. Tests should be defined only in terms of the exported API.

import {
  INIT, STEP, RESULT, isReduced, unreduced, reduced, transducer, ezducer
} from '../reducing'

test('reducing fns work', () => {
  expect(isReduced(42))
    .toStrictEqual(false)
  expect(isReduced(reduced(42)))
    .toStrictEqual(true)
  expect(isReduced(reduced(reduced(42))))
    .toStrictEqual(true)
  expect(isReduced(unreduced(reduced(reduced(42)))))
    .toStrictEqual(false)
  expect(isReduced(unreduced(unreduced(reduced(reduced(42))))))
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

test('ezduze works', () => {
  const xf = ezducer(() => ({
    step: (v) => [v, v, reduced, v],
    result: () => [42]
  }))

  const r1 = {
    [INIT]: () => 0,
    [STEP]: (a, v) => a + v,
    [RESULT]: (a) => a + 10
  }

  const r2 = xf(r1)

  expect(r2[INIT]())
    .toStrictEqual(0)
  expect(unreduced(r2[STEP](0, 1)))
    .toStrictEqual(2)
  expect(r2[RESULT](2))
    .toStrictEqual(54)
})

test('ezduze defaults work', () => {
  const xf = ezducer(() => ({}))

  const r1 = {
    [INIT]: () => 0,
    [STEP]: (a, v) => a + v,
    [RESULT]: (a) => a + 10
  }

  const r2 = xf(r1)

  expect(r2[INIT]())
    .toStrictEqual(0)
  expect(r2[STEP](0, 1))
    .toStrictEqual(1)
  expect(r2[STEP](1, 1))
    .toStrictEqual(2)
  expect(r2[RESULT](2))
    .toStrictEqual(12)
})
