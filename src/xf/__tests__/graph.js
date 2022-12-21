// Rules for this file
// 1. Coverage report should be at 100% when testing only this file.
// 2. Tests should be defined only in terms of the public API.

const { pathRefToArray } = require('../pathref')
const { $, graph, walk, chain, pg } = require('../graph')

const s = (...args) => new Set(args)

const dePathRef = (g) => {
  g.nodes = Object.fromEntries(
    Object.entries(g.nodes).map(([k, v]) => [k, pathRefToArray(v)]))
  return g
}

test('defining graphs', () => {
  expect(graph())
    .toStrictEqual({ nodes: {}, in: {}, out: {} })
  expect(graph({}, []))
    .toStrictEqual({ nodes: {}, in: {}, out: {} })
  expect(() => graph({
  }, [
    [$.a, $.b]
  ]))
    .toThrow()

  expect(graph({
    a: 43, b: true
  }, [
    [$.a, $.b]
  ]))
    .toStrictEqual({
      nodes: { a: 43, b: true },
      in: { b: s(['a']) },
      out: { a: s(['b']) }
    })

  expect(dePathRef(graph({
    a: 24,
    b: 'hello',
    in: $.a,
    out: $.b
  }, [
    [$.a, $.b],
    [$.a, $.b],
    [$.in, $.out],
    [$.b, $.b]
  ])))
    .toStrictEqual({
      nodes: { a: 24, b: 'hello', in: ['a'], out: ['b'] },
      in: { b: s(['a'], ['b']) },
      out: { a: s(['b']), b: s(['b']) }
    })
})

test('self-referencing alias fails', () => {
  expect(() => graph({
    a: $.b, b: $.a
  }, [
    [$.a, $.b]
  ]))
    .toThrow()
})

test('subgraphs missing "out" node fails', () => {
  expect(() => graph({
    a: graph(), b: true
  }, [
    [$.a, $.b]
  ]))
    .toThrow()
})

test('subgraphs missing "in" node fails', () => {
  expect(() => graph({
    a: 43, b: graph()
  }, [
    [$.a, $.b]
  ]))
    .toThrow()
})

test('subpath into non-graph node fails', () => {
  expect(() => graph({
    a: 43, b: 23
  }, [
    [$.a.b, $.b]
  ]))
    .toThrow()

  expect(() => graph({
    a: 43, b: 23
  }, [
    [$.a, $.b.c]
  ]))
    .toThrow()
})

test('defining subgraphs', () => {
  expect(graph({
    a: graph({ out: 42 }), b: true
  }, [
    [$.a, $.b]
  ]))
    .toStrictEqual({
      nodes: {
        a: { nodes: { out: 42 }, in: {}, out: {} },
        b: true
      },
      in: { b: s(['a', 'out']) },
      out: { a: { out: s(['b']) } }
    })

  expect(graph({
    a: graph({ out: 42 }), b: graph({ in: 56 })
  }, [
    [$.a, $.b]
  ]))
    .toStrictEqual({
      nodes: {
        a: { nodes: { out: 42 }, in: {}, out: {} },
        b: { nodes: { in: 56 }, in: {}, out: {} }
      },
      in: { b: { in: s(['a', 'out']) } },
      out: { a: { out: s(['b', 'in']) } }
    })
})

test('walking graphs', () => {
  const g = graph(
    {
      1: 22,
      a: graph({ in: 34, out: 42 }, [[$.in, $.out]]),
      b: graph({ in: 56, out: 78 }, [[$.in, $.out]]),
      c: 97
    },
    [
      [$[1], $.c],
      [$.a, $.b],
      [$.a, $.c],
      [$.a.in, $.a.out]
    ])

  expect(walk(g, (a, v) => [v, ...a]))
    .toStrictEqual([[22, [97]], [34, [42, [56, [78]], [97]]]])

  expect(walk(g, (a, v) => [v, ...a], false))
    .toStrictEqual([[78, [56, [42, [34]]]], [97, [22], [42, [34]]]])

  expect(() =>
    walk(
      graph(
        {
          1: 22,
          a: graph({ in: 34, out: 42 }, [[$.in, $.out]]),
          b: graph({ in: 56, out: 78 }, [[$.in, $.out]]),
          c: 97
        },
        [
          [$[1], $.c],
          [$.a, $.b],
          [$.a, $.c],
          [$.a.in, $.a.out],
          [$.b.out, $.a.out]
        ]),
      (a, v) => [v, ...a]))
    .toThrow()
})

test('printing graphs', () => {
  console.dir = jest.fn()
  pg(graph({ a: 1, b: 2 }))
  expect(console.dir).toHaveBeenCalled()
})

test('chain works', () => {
  expect(dePathRef(chain(1, 2, 3)))
    .toStrictEqual({
      nodes: { 0: 1, 1: 2, 2: 3, in: ['0'], out: ['2'] },
      in: { 1: s(['0']), 2: s(['1']) },
      out: { 0: s(['1']), 1: s(['2']) }
    })
})
