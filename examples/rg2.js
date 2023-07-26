// Goal is to try out the new runGraph
import * as xf from '../src/xf/index.js'
import { $ } from '../src/xf/index.js'

const run = xf.makeRun(
  { wheee: 42 },
  {
    ...xf.sources
  },
  {
    ...xf.sinks
  })

const subgraph = (msg) =>
  xf.graph({
    init: xf.source('init'),
    timer: xf.source('timer', 200),
    stopTimer: xf.source('timer', 5000),
    emitFalse: xf.emit(false),
    ender: xf.takeWhile(x => x),
    wheee: xf.emit(msg),
    debug: xf.sink('debug')
  }, [
    [$.init, $.wheee],
    [$.timer, $.ender],
    [$.ender, $.wheee],
    [$.wheee, $.debug],
    [$.stopTimer, $.emitFalse],
    [$.emitFalse, $.ender]
  ])

const mytransducer = () =>
  xf.chain(
    xf.partition(2, 1),
    xf.map(([a, b]) => b - a),
    xf.partition(12, 6),
    xf.map((ttl) => ttl.reduce((t, x) => (t + x)) / 12))

const emitEach = (xs) =>
  xf.chain(
    xf.take(xs.length),
    xf.reductions((i, _) => i + 1, -1),
    xf.map(i => xs[i % xs.length])
  )

const g = xf.graph({
  timer: xf.source('timer', 100),
  limit: xf.take(30),
  delta: mytransducer(),
  hello: xf.emit('hello'),
  world: xf.epilog('world'),
  d2: xf.partition(2, 2),
  debug: xf.sink('debug'),

  init: xf.source('init'),
  timer2: xf.source('timer', 10000),
  msgs: emitEach(['wheee', 'ooooh']),
  graph: xf.map(subgraph),
  run: xf.sink('run')
}, [
  [$.timer, $.limit],
  [$.limit, $.delta],
  [$.limit, $.hello],
  [$.hello, $.world],
  [$.world, $.debug],
  [$.delta, $.debug],

  [$.init, $.msgs],
  [$.timer2, $.msgs],
  [$.msgs, $.graph],
  [$.graph, $.run]
])

const g2 = xf.graph({}, [])

const g3 = xf.graph({
  a: xf.identity
}, [])

const g4 = xf.graph({
  a: xf.source('timer', 1000),
  b: xf.compose(xf.take(4), xf.emit('test')),
  c: xf.sink('pipe', 'a'),
  d: xf.source('pipe', 'a'),
  e: xf.take(2),
  f: xf.sink('debug')
}, [
  [$.a, $.b],
  [$.b, $.c],
  // magic happens
  [$.d, $.e],
  [$.e, $.f]
])

export const runG4 = async () => {
  xf.pg(g4)
  await run(g4)
}

const g5 = xf.graph({
  a: xf.source('timer', 1000),
  b: xf.take(3),
  c: xf.sink('debug')
}, [
  [$.a, $.b],
  [$.b, $.c]
])

export const runG5 = async () => {
  xf.pg(g5)
  await run(g5)
}

export default async () => {
  xf.pg(g3)
  await run(g3)

  xf.pg(g2)
  await run(g2)

  xf.pg(g)
  await run(g)
}
