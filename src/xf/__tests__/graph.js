// Rules for this file
// 1. Coverage report should be at 100% when testing only this file.
// 2. Tests should be defined only in terms of the public API.

const { $, graph, walk, pg } = require('../graph')

const s = (...args) => new Set(args)

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

  expect(graph({
    a: 43, b: true
  }, [
    [$.a, $.b],
    [$.a, $.b],
    [$.b, $.b]
  ]))
    .toStrictEqual({
      nodes: { a: 43, b: true },
      in: { b: s(['a'], ['b']) },
      out: { a: s(['b']), b: s(['b']) }
    })

  expect(() => graph({
    a: graph(), b: true
  }, [
    [$.a, $.b]
  ]))
    .toThrow()

  expect(() => graph({
    a: 43, b: graph()
  }, [
    [$.a, $.b]
  ]))
    .toThrow()

  expect(() => graph({
    a: 43, b: graph()
  }, [
    [$.a.b, $.b.c]
  ]))
    .toThrow()

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
