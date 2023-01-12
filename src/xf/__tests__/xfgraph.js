// Rules for this file
// 1. Coverage report should be at 100% when testing only this file.
// 2. Tests should be defined only in terms of the public API.

import t from 'transducist'
import { identity } from '../util'
import { $ } from '../pathref'
import { graph } from '../graph'
import {
  composeGraph, xfgraph, mapjoin
} from '../xfgraph'

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

  const g = graph({
    a: identity,
    b: identity,
    c: t.map(x => x + 1),
    d: t.take(1)
  }, [[$.a, $.c], [$.a, $.d], [$.b, $.d]])

  expect(T(xfgraph(g), [['a', 3], ['b', 2]]))
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
