// Rules for this file
// 1. Coverage report should be at 100% when testing only this file.
// 2. Tests should be defined only in terms of the public API.
//
const t = require('transducist')
const ex = require('../net-examples')

const T = (n, xs) =>
  t.transduce(xs, n, t.toArray())

test('examples still work', () => {
  expect(ex.empty)
    .toBeDefined()
  expect(T(ex.empty, [1, 2, 3]))
    .toStrictEqual([])
  expect(T(ex.single, [1, 2, 3]))
    .toStrictEqual([['n']])
  expect(T(ex.single, [['n', 1], ['n', 2], ['n'], ['n', 3]]))
    .toStrictEqual([['n', 1], ['n', 2], ['n']])
  expect(T(ex.embedding, [['i1', 1], ['i1', 2], ['i1'], ['i1', 3]]))
    .toStrictEqual([
      ['o1', 1], ['o2', 1],
      ['o1', 2], ['o2', 2],
      ['o1'], ['o2']
    ])
})
