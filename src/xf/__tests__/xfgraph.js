// Rules for this file
// 1. Coverage report should be at 100% when testing only this file.
// 2. Tests should be defined only in terms of the public API.

const t = require('transducist')
const { identity } = require('../util')
const { $, graph } = require('../graph')
const { map, take } = require('../xflib')
const {
  composeGraph, xfgraph, mapjoin, chain
} = require('../xfgraph')

const T = (xf, data) =>
  t.transduce(data, xf, t.toArray())

test('composeGraph works', () => {
  expect(composeGraph(graph(), {
    leafFn: (_path, _value) => [],
    rootFn: (_path, _value, xf) => xf
  }))
    .toStrictEqual([])
})

test('xfgraph works', () => {
  expect(T(xfgraph(graph()), []))
    .toStrictEqual([])

  expect(T(xfgraph(graph({
    a: identity,
    b: identity,
    c: map(x => x + 1),
    d: take(1)
  }, [[$.a, $.c], [$.a, $.d], [$.b, $.d]])),
  [['a', 3], ['b', 2]]))
    .toStrictEqual([['c', 4], ['d', 3], ['d'], ['c']])
})

test('mapjoin works', () => {
  expect(T(xfgraph(graph({
    a: identity,
    b: identity,
    c: mapjoin((x, y) => x + y, [true, false])
  }, [[$.a, $.c[0]], [$.b, $.c[1]]])),
  [['a', 3], ['b', 2], ['b', 3], ['b', 4], ['a', 5]]))
    .toStrictEqual([['c', 5], ['c', 9], ['c']])
})

test('chain works', () => {
  expect(T(xfgraph(chain([
    map(x => x + 1),
    map(x => x + 1),
    take(2)
  ])),
  [['in', 3], ['in', 2], ['in', 1]]))
    .toStrictEqual([['out', 5], ['out', 4], ['out']])
})
