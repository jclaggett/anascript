const t = require('transducist')
const {
  $,
  source,
  integrate,
  isReduced,
  net,
  xfnode,
  sink,
  step
} = require('.')

// A source is a map of async iterables that emit a sequence of values
const sources = {
  init: async function * () {
    yield { env: process.env, argv: process.argv }
  },

  N: async function * () {
    let i = 0
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 500))
      yield i++
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
  console.warn('Unexpected source:', id)
  return async function * () {
    return undefined
  }
}

const defaultSink = (id) => {
  console.warn('Unexpected sink:', id)
  return (x) => console.debug(`DEBUG: sink ${id} received '${x}`)
}

const run = (netMap) => {
  return integrate(netMap, {
    inputer: async (_, node, xf) => {
      if (node.type === 'source') {
        const source = sources[node.value] ?? defaultSource(node.value)
        const transformer = xf(t.count())

        let accumulator
        for await (const value of source()) {
          // TODO handle reduced values
          accumulator = step(transformer, accumulator, value)
          if (isReduced(accumulator)) {
            break
          }
        }
      }
    },

    outputer: (_, node) =>
      t.map(sinks[node.value] ?? defaultSink(node.value)),

    finisher: async (results) => {
      await Promise.all(results)
    }
  })
}

const ex1 = net({
  init: source({ name: 'init' }),
  log: sink({ name: 'log' }, $.init)
})()

const ex3 = net({
  N: source({ name: 'time', freq: 500 }),
  t5: xfnode(t.take(5), $.N),
  log: sink({ name: 'log' }, $.t5)
})()

module.exports = { run, ex1, ex3, sources, sinks }
