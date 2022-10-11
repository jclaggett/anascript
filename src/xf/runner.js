const t = require('transducist')
const {
  $,
  source,
  integrate,
  isReduced,
  map,
  net,
  sink,
  step,
  take,
  active,
  passive,
  embed,
  xfnode
} = require('.')

// A source is a map of async iterables that emit a sequence of values
const sources = {
  init: async function * () {
    yield { env: process.env, argv: process.argv }
  },

  time: async function * ({ freq }) {
    while (true) {
      yield Date.now()
      await new Promise(resolve => setTimeout(resolve, freq))
    }
  }
}

// A sink is a map of 'functions' that perform side effects
const sinks = {
  log: console.log,
  debug: console.debug,
  dir: console.dir
}

const defaultSource = (id) => {
  console.warn('Unknown source:', id)
  return async function * () {
    return undefined
  }
}

const defaultSink = (id) => {
  console.warn('Unknown sink:', id)
  return (x) => console.debug(`DEBUG: sink ${id} received:`, x)
}

const pipes = {}

const defaultPipe = (name) =>
  (x) => console.debug(
    `Unknonwn or closed pipe ${name}. ignoring:`, x)

const setPipe = (name, transformer) => {
  pipes[name] = (x) =>
    setImmediate(() => {
      if (isReduced(step(transformer, undefined, x))) {
        pipes[name] = undefined
      }
    })
}

const getPipe = (name) =>
  (x) => ((pipes[name] == null)
    ? defaultPipe(name)
    : pipes[name])(x)

const run = async (netMap) => {
  await Promise.all(
    integrate(netMap, {
      inputer: async (id, value, xf) => {
        if (value.type !== 'source') {
          return
        }

        const transformer = xf(t.count())

        if (value.value?.type === 'pipe') {
          return setPipe(value.value?.name, transformer)
        }

        const type = (value.value?.type ?? id)
        const source = sources[type] ?? defaultSource(type)

        for await (const x of source(value.value)) {
          if (isReduced(step(transformer, undefined, x))) {
            break
          }
        }
      },

      outputer: (id, value) => {
        if (value.type !== 'sink') {
          return []
        }

        const type = value.value?.type ?? id
        const sink = type === 'pipe'
          ? getPipe(value.value?.name)
          : sinks[type] ?? defaultSink(type)
        return [t.map(sink)]
      }
    }))
}

const ex1 = net({
  init: source({}),
  time: source({ freq: 500 }),
  take5: take(5, $.time),
  user: map(x => x.env.USER, $.init),
  usertime: map((user, time) => [user, time],
    $.user,
    $.take5),
  log: sink({}, $.usertime),
  debugtake: map(x => `debugging take 5: ${x}`, $.take5),
  debug: sink({}, $.debugtake)
})

const foo = net({
  init: source({}),
  time: source({ freq: 0 }),
  myinit: map(_ => ({ env: { USER: 'nmosher' } }), $.init),
  ex1: embed(ex1, { init: $.myinit, time: $.time }),
  debug: sink({}, [$.ex1.log])
})

const ex2 = net({
  N: source({ type: 'time', freq: 100 }),
  t5: take(5, $.N),
  t10: take(10, $.N),
  msg: map((x, y) => `logging ${x} ${y}`, active($.t5), passive($.t10)),
  log: sink({}, $.msg),
  dir: sink({}, [$.t10, $.t5])
})

const ex3 = net({
  time: source({ freq: 99 }),
  t5a: take(5, $.time),
  t5b: take(5, $.time),
  log: sink({}, [$.t5a, $.t5b])
})

const ex4 = net({
  time: source({ freq: 500 }),
  pipeOut: source({ type: 'pipe', name: 'foo' }),

  time5: take(5, $.time),
  node1: map((tsnew, tsold) => tsnew - tsold,
    $.time5,
    passive([$.time5, $.pipeOut])),
  node5: take(5, $.node1),

  pipeIn: sink({ type: 'pipe', name: 'foo' }, $.node5),
  log: sink({}, $.node5)
})

const ex5 = net({
  init: source({}),

  n1: map(x => x.env.USER, $.init),
  n2: xfnode(t.mapIndexed((x, i) => [x, i]), $.init),

  log: sink({}, [$.n1, $.n2])
})

/*
const any = (...x) => x
const all = (...x) => x

const exampleB = net({
  nodes: {
    N: source({ type: 'time', freq: 100 }),
    t5: take(5),
    msg: map((x, y) => `logging ${x} ${y}}`),
    log: sink(),
    dir: sink()
  },
  edges: { // to: from
    t5: $.N,
    msg: all(active($.t5), passive($.N)),
    log: $.msg,
    dir: any($.N, $.t5)
  }
})
*/

module.exports = { run, foo, ex1, ex2, ex3, ex4, ex5, sources, sinks }
