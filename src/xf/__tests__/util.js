// Rules for this file
// 1. Coverage report should be at 100% when testing only this file.
// 2. Tests should be defined only in terms of the exported API.

const { identity, first, second, last, butLast } = require('../util')

test('util fns work', () => {
  const data = [1, 2, 3]
  expect(identity(data))
    .toStrictEqual(data)
  expect(first(data))
    .toStrictEqual(1)
  expect(second(data))
    .toStrictEqual(2)
  expect(last(data))
    .toStrictEqual(3)
  expect(butLast(data))
    .toStrictEqual([1, 2])
})
