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
  passive
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
  return (x) => console.debug(`DEBUG: sink ${id} received '${x}`)
}

const run = async (netMap) => {
  await Promise.all(
    integrate(netMap, {
      inputer: async (id, value, xf) => {
        if (value.type !== 'source') {
          return
        }

        const name = (value.value?.name ?? id)
        const source = sources[name] ?? defaultSource(name)
        const transformer = xf(t.count())

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
        const name = value.value?.name ?? id
        return [t.map(sinks[name] ?? defaultSink(name))]
      }
    }))
}

const ex1 = net({
  init: source({}),
  log: sink({}, $.init)
})

const ex2 = net({
  N: source({ name: 'time', freq: 100 }),
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
/*
const any = (...x) => x
const all = (...x) => x

const exampleB = net({
  nodes: {
    N: source({ name: 'time', freq: 100 }),
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

module.exports = { run, ex1, ex2, ex3, sources, sinks }
