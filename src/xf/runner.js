const t = require('transducist')
const {
  $,
  input,
  integrate,
  net,
  node,
  output,
  step
} = require('.')

// Inputs are a map of async iterables that emit a sequence of values
const inputs = {
  init: async function * () {
    yield { env: process.env }
  },

  N: async function * () {
    for (let i = 0; i < 10; i++) {
      yield i
    }
  }
}

// Outputs are a map of 'functions' that perform side effects
const outputs = {
  log: console.log
}

const defaultInput = (id) => {
  console.warn('Unexpected input:', id)
  return async function * () {
    return undefined
  }
}

const defaultOutputHandler = (id) => {
  console.warn('Unexpected output:', id)
  return (x) => console.debug(`DEBUG: output ${id} received '${x}`)
}

const run = (netMap) => {
  return integrate(netMap, {
    inputer: async (id, xf) => {
      const input = inputs[id] ?? defaultInput(id)
      const transformer = xf(t.count())

      let accumulator
      for await (const value of input()) {
        accumulator = step(transformer, accumulator, value)
      }
    },

    outputer: (id) => t.map(outputs[id] ?? defaultOutputHandler(id)),

    finisher: async (results) => {
      await Promise.all(results)
    }
  })
}

const ex1 = net({
  init: input(),
  log: output($.init)
})()

const ex2 = net({
  init: input(),
  user: node(t.map(x => x.env.USER), $.init),
  shell: node(t.map(x => x.env.SHELL), $.init),
  log: output([$.user, $.shell])
})()

module.exports = { run, ex1, ex2, inputs, outputs }
