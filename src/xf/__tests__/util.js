// Rules for this file
// 1. Coverage report should be at 100% when testing only this file.
// 2. Tests should be defined only in terms of the exported API.

const {
  compose, identity, isEmpty, rest, first, second, last, butLast
} = require('../util')

test('util fns work', () => {
  const data = [1, 2, 3]
  expect(isEmpty(data))
    .toStrictEqual(false)
  expect(identity(data))
    .toStrictEqual(data)
  expect(first(data))
    .toStrictEqual(1)
  expect(second(data))
    .toStrictEqual(2)
  expect(last(data))
    .toStrictEqual(3)
  expect(rest(data))
    .toStrictEqual([2, 3])
  expect(butLast(data))
    .toStrictEqual([1, 2])
  expect(compose()(data))
    .toStrictEqual([1, 2, 3])
  expect(compose(last, butLast)(data))
    .toStrictEqual(2)
})