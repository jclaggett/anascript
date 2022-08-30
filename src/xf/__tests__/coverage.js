// Rules for this file
// 1. Coverage report should be at 100% when testing only this file.
// 2. Tests should be defined only in terms of the public API.

const t = require('transducist')
const {
  isReduced, reduced, unreduced,
  isActive, isPassive, active, passive,
  multiplex, demultiplex, detag, final,
  $, embed, input, join, net, node, output
} = require('../index')
const ex = require('../examples')

const T = (n, xs) =>
  t.transduce(xs, n, t.toArray())

test('reduced protocol', () => {
  expect(isReduced(reduced(reduced(42))))
    .toStrictEqual(true)
  expect(isReduced(unreduced(unreduced(reduced(42)))))
    .toStrictEqual(false)
})

test('active/passive protocol', () => {
  expect(isPassive(passive(passive(42))))
    .toStrictEqual(true)
  expect(isActive(active(active(passive(42)))))
    .toStrictEqual(true)
})

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
  expect(T(ex.embedding2, [['i1', 1], ['i2', 2], ['i1'], ['i2', 3]]))
    .toStrictEqual([
      ['o2', 1], ['o2', 1], ['o2', 1], ['o2', 1],
      ['o2', 2], ['o2', 2],
      ['o2', 3], ['o2', 3],
      ['o2']
    ])
  expect(T(ex.joining, [['i2', 1], ['i1', 2], ['i1'], ['i2', 3]]))
    .toStrictEqual([
      ['o1', 3], ['o2', 3], ['o1', 5],
      ['o2'], ['o1']
    ])
})

test('transducing with initial values', () => {
  expect(t.transduce([2, 3, 4], final(42), t.toArray(), null))
    .toStrictEqual([2, 3, 4, 42])
  expect(t.transduce([[1, 1], [1], [1, 2]],
    demultiplex(detag(1)), t.toArray(), null))
    .toStrictEqual([1])

  const demult = demultiplex(t.take(3))
  const mult = multiplex([demult, demult])
  expect(t.transduce([1, 2, 3], mult, t.toArray(), 42))
    .toStrictEqual([1, 1, 2])
})

test('transducer nets', () => {
  expect(T(net(), []))
    .toStrictEqual([])
  expect(T(net({ n: input() }), []))
    .toStrictEqual([['n']])
  expect(T(net({ n: input() }), [['n']]))
    .toStrictEqual([['n']])
  expect(T(net({ n: input() }), [['n', 1]]))
    .toStrictEqual([['n', 1], ['n']])
  expect(T(net({ n: input() }), [['n', 1]]))
    .toStrictEqual([['n', 1], ['n']])
  expect(T(net({
    a: input(),
    b: input(),
    c: output([$.a, $.b]),
    d: output([$.a, $.b])
  }), [['a', 1], ['b', 2]]))
    .toStrictEqual([
    ['c', 1], ['d', 1],
    ['c', 2], ['d', 2],
    ['c'], ['d']
  ])

  expect(T(net({
    a: input(),
    b: input(),
    j: join((a, b) => a + b, $.a, $.b),
    c: output($.j)
  }), [['a', 1], ['b']]))
    .toStrictEqual([['c']])

  expect(T(net({
    a: node(t.take(3)),
    b: output($.a),
    c: output($.a)
  }), [['a', 1]]))
    .toStrictEqual([['b', 1], ['c', 1], ['b'], ['c']])

  expect(T(net({
    a: node(t.take(1)),
    b: embed(net({
      ba: node(t.take(1)),
      bb: node(t.take(1), $.ba),
      bc: node(t.take(1), $.ba)
    }), { ba: $.a }),
    c: output($.b.bb)
  }), [['a', 1]]))
    .toStrictEqual([['c', 1], ['c']])

})
