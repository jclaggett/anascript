// Rules for this file
// 1. Coverage report should be at 100% when testing only this file.
// 2. Tests should be defined only in terms of the exported API.

import * as util from '../util'

test('util fns work', () => {
  const data = [1, 2, 3]
  expect(util.isEmpty(data))
    .toStrictEqual(false)
  expect(util.identity(data))
    .toStrictEqual(data)
  expect(util.first(data))
    .toStrictEqual(1)
  expect(util.second(data))
    .toStrictEqual(2)
  expect(util.last(data))
    .toStrictEqual(3)
  expect(util.rest(data))
    .toStrictEqual([2, 3])
  expect(util.butLast(data))
    .toStrictEqual([1, 2])
  expect(util.compose()(data))
    .toStrictEqual([1, 2, 3])
  expect(util.compose(util.last, util.butLast)(data))
    .toStrictEqual(2)
  const c = util.contains(1, 2, 3)
  expect(c(1))
    .toStrictEqual(true)
  expect(c(4))
    .toStrictEqual(false)
})
