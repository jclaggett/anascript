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
  result,

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
const defaultSource = (id) => {
  console.warn('Unknown source:', id)
  return async function * () {
    return undefined
  }
}

const sinks = {
  log: console.log,
  debug: console.debug,
  dir: console.dir
}

const defaultSink = (id) => {
  console.warn('Unknown sink:', id)
  return (x) => console.debug(`DEBUG: sink ${id} received:`, x)
}

const defaultPipe = (name) =>
  (x) => console.debug(
    `Unknonwn or closed pipe ${name}. ignoring:`, x)

const setPipe = (pipes, name, transformer) => {
  pipes[name] = (x) =>
    setImmediate(() => {
      if (isReduced(step(transformer, undefined, x))) {
        pipes[name] = undefined
      }
    })
}

const getPipe = (pipes, name) =>
  (x) => ((pipes[name] == null)
    ? defaultPipe(name)
    : pipes[name])(x)

const run = async (netMap, parentPipes = {}) => {
  const localPipes = Object.setPrototypeOf({}, parentPipes)
  const localSinks = Object.setPrototypeOf({
    run: (netMap) => run(netMap, localPipes)
  }, sinks)

  await Promise.all(integrate(netMap, {
    inputer: async (value, xf) => {
      if (value.type !== 'source') {
        return
      }

      const type = value.value?.type
      const transformer = xf(t.count())

      if (type === 'pipe') {
        return setPipe(localPipes, value.value?.name, transformer)
      }

      const source = sources[type] ?? defaultSource(type)
      for await (const x of source(value.value)) {
        if (isReduced(step(transformer, undefined, x))) {
          return
        }
      }

      result(transformer, undefined)
    },

    outputer: (value) => {
      if (value.type !== 'sink') {
        return []
      }

      const type = value.value?.type
      const sink = type === 'pipe'
        ? getPipe(localPipes, value.value?.name)
        : localSinks[type] ?? defaultSink(type)
      return [t.map(sink)]
    }
  }))
}

const ex1 = net({
  init: source({ type: 'init' }),
  time: source({ type: 'time', freq: 500 }),

  take5: take(5, $.time),
  user: map(x => x.env.USER, $.init),
  usertime: map((user, time) => [user, time],
    $.user,
    $.take5),
  debugtake: map(x => `debugging take 5: ${x}`, $.take5),

  log: sink({ type: 'log' }, $.usertime),
  debug: sink({ type: 'debug' }, $.debugtake)
})

const foo = net({
  init: source({ type: 'init' }),
  time: source({ type: 'time', freq: 0 }),

  myinit: map(_ => ({ env: { USER: 'nmosher' } }), $.init),
  ex1: embed(ex1, { init: $.myinit, time: $.time }),

  debug: sink({ type: 'debug' }, [$.ex1.log])
})

const ex2 = net({
  N: source({ type: 'time', freq: 100 }),

  t5: take(5, $.N),
  t10: take(10, $.N),
  msg: map((x, y) => `logging ${x} ${y}`, active($.t5), passive($.t10)),

  log: sink({ type: 'log' }, $.msg),
  dir: sink({ type: 'dir' }, [$.t10, $.t5])
})

const ex3 = net({
  time: source({ type: 'time', freq: 99 }),

  t5a: take(5, $.time),
  t5b: take(5, $.time),

  log: sink({ type: 'log' }, [$.t5a, $.t5b])
})

const ex4 = net({
  time: source({ type: 'time', freq: 500 }),
  pipeOut: source({ type: 'pipe', name: 'foo' }),

  time5: take(5, $.time),
  node1: map((tsnew, tsold) => tsnew - tsold,
    $.time5,
    passive([$.time5, $.pipeOut])),
  node5: take(5, $.node1),

  pipeIn: sink({ type: 'pipe', name: 'foo' }, $.node5),
  log: sink({ type: 'log' }, $.node5)
})

const ex5 = net({
  init: source({ type: 'init' }),

  n1: map(x => x.env.USER, $.init),
  n2: xfnode(t.mapIndexed((x, i) => [x, i]), $.init),

  log: sink({ type: 'log' }, [$.n1, $.n2])
})

const ex6 = net({
  time: source({ type: 'time', freq: 500 }),
  pipe: source({ type: 'pipe', name: 'root' }),

  time5: take(5, $.time),
  net: map(ts => net({
    init: source({ type: 'init' }),
    whee: map(x => [ts, x.env.USER], $.init),
    pipe: sink({ type: 'pipe', name: 'root' }, $.whee),
    log: sink({ type: 'log' }, $.whee)
  }),
  $.time5),

  netmsg: map(n => Object.keys(n), $.net),
  pipemsg: map(x => `root pipe received: ${x}`, $.pipe),

  run: sink({ type: 'run' }, $.net),
  log: sink({ type: 'log' }, [$.netmsg, $.pipemsg])
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

module.exports = { run, foo, ex1, ex2, ex3, ex4, ex5, ex6, sources, sinks }
