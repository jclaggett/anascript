// Rules for this file
// 1. Coverage report should be at 100% when testing only this file.
// 2. Tests should be defined only in terms of the public API.

const t = require('transducist')
const {
  isReduced, reduced, unreduced, isActive, isPassive, active, passive,
  multiplex, demultiplex, detag, epilog, $, embed, source, map, net, node,
  sink, take, walk, xfnet, remap, dropAll, after, prolog
} = require('..')
const ex = require('../examples')

const T = (netMap, xs) =>
  t.transduce(xs, xfnet(netMap), t.toArray())

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

test('net creation', () => {
  expect(net({}))
    .toStrictEqual({})

  expect(net({
    a: node(1)
  }))
    .toStrictEqual({
      a: { value: 1, inputs: [], outputs: [] }
    })
  expect(() => net({
    a: node(1, $.x)
  }))
    .toThrow()

  expect(net({
    a: node(1),
    b: node(2, $.a)
  }))
    .toStrictEqual({
      a: { value: 1, inputs: [], outputs: [['b']] },
      b: { value: 2, inputs: [['a']], outputs: [] }
    })

  expect(net({
    a: node(1),
    b: node(2, $.a),
    c: node(3, [$.a, $.b])
  }))
    .toStrictEqual({
      a: { value: 1, inputs: [], outputs: [['b'], ['c']] },
      b: { value: 2, inputs: [['a']], outputs: [['c']] },
      c: { value: 3, inputs: [['a'], ['b']], outputs: [] }
    })
})

test('net walking', () => {
  expect(walk(net({
    a: node(1),
    b: node(2, $.a),
    c: node(3, [$.a, $.b]),
    d: node(4, [$.b, $.c])
  }), (id, _node, _enclosingNode, _kids) => id))
    .toStrictEqual(['a'])

  const subnet = net({ out: node(1), a: node(2) })
  const subsubnet = net({ a: embed(subnet) })
  expect(walk(net({
    a: node(1),
    b: embed(subnet, { out: $.a, a: $.a }),
    c: embed(subsubnet, { a: { out: $.b.out } }),
    d: node(4, [$.b, $.b.a, $.c.a.out])
  }), (id, _node, _enclosingNode, _kids) => id))
    .toStrictEqual(['a'])
})

test('examples still work', () => {
  expect(ex.empty)
    .toBeDefined()
  expect(T(ex.empty, [1, 2, 3]))
    .toStrictEqual([])
  expect(T(ex.single, [1, 2, 3]))
    .toStrictEqual([['n']])
  expect(T(ex.single, [['n', 1], ['n', 2], ['n'], ['n', 3]]))
    .toStrictEqual([['n', 2], ['n', 3], ['n']])
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

test('various tranducers', () => {
  expect(t.transduce([1, 2, 3], remap((r, v) => r + v, 42), t.toArray()))
    .toStrictEqual([43, 45, 48])
  expect(t.transduce([2, 3, 4], epilog(42), t.toArray(), null))
    .toStrictEqual([2, 3, 4, 42])
  expect(t.transduce([2, 3, 4], prolog(42), t.toArray(), null))
    .toStrictEqual([42, 2, 3, 4])
  expect(t.transduce([], prolog(42), t.toArray(), null))
    .toStrictEqual([42])
  expect(t.transduce([1, 2, 3], t.compose(prolog(42), t.take(1)), t.toArray(), null))
    .toStrictEqual([42])
  expect(t.transduce([1, 2, 3], dropAll, t.toArray()))
    .toStrictEqual([])
  expect(t.transduce([1, 2, 3], after(42), t.toArray()))
    .toStrictEqual([42])
  expect(t.transduce(
    [1, 2, 3, 4, 5],
    t.compose(multiplex([t.take(1), t.map(x => -x)]), t.take(3)),
    t.toArray(),
    null))
    .toStrictEqual([1, -1, -2])
  expect(t.transduce([[1, 1], [1], [1, 2]],
    t.compose(demultiplex(1), detag(1)), t.toArray(), null))
    .toStrictEqual([1])

  const demult = t.compose(demultiplex(2), t.take(3))
  const mult = multiplex([demult, demult])
  expect(t.transduce([1, 2, 3], mult, t.toArray(), 42))
    .toStrictEqual([1, 1, 2])
})

test('transducer nets', () => {
  expect(T(net(), []))
    .toStrictEqual([])
  expect(T(net({ n: source({ type: 'init' }) }), []))
    .toStrictEqual([['n']])
  expect(T(net({ n: source({ type: 'init' }) }), [['n']]))
    .toStrictEqual([['n']])
  expect(T(net({ n: source({ type: 'init' }) }), [['n', 1]]))
    .toStrictEqual([['n', 1], ['n']])
  expect(T(net({ n: source({ type: 'init' }) }), [['n', 1]]))
    .toStrictEqual([['n', 1], ['n']])
  expect(T(net({
    a: source({ type: 'init' }),
    b: source({ type: 'time' }),
    c: sink({ type: 'log' }, [$.a, $.b]),
    d: sink({ type: 'debug' }, [$.a, $.b])
  }), [['a', 1], ['b', 2]]))
    .toStrictEqual([
      ['c', 1], ['d', 1],
      ['c', 2], ['d', 2],
      ['c'], ['d']
    ])

  expect(() => T(net({ a: sink({ type: 'log' }, [$.foo]) }), []))
    .toThrow()

  expect(T(net({ a: sink({ type: 'log' }, 42) }), []))
    .toStrictEqual([['a']])

  expect(T(net({
    a: source({ type: 'init' }),
    b: source({ type: 'init' }),
    j: map((a, b) => a + b, $.a, $.b),
    c: sink({ type: 'log' }, $.j)
  }), [['a', 1], ['b']]))
    .toStrictEqual([['c']])

  expect(T(net({
    a: take(3),
    b: sink({ type: 'log' }, $.a),
    c: sink({ type: 'debug' }, $.a)
  }), [['a', 1]]))
    .toStrictEqual([['b', 1], ['c', 1], ['b'], ['c']])

  expect(T(net({
    a: take(1),
    b: embed(net({
      ba: take(1),
      bb: take(1, $.ba),
      bc: take(1, $.ba)
    }), { ba: $.a }),
    c: sink({ type: 'log' }, $.b.bb)
  }), [['a', 1]]))
    .toStrictEqual([['c', 1], ['c']])
})
