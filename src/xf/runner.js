const { opendir } = require('fs/promises')
const t = require('transducist')
const { integrate, isReduced, step, result } = require('.')

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

const derive = Object.setPrototypeOf

const runNet = async (netMap, env) => {
  const localEnv = derive({
    pipes: derive({}, env.pipes),
    sinks: derive({
      run: (netMap) => runNet(netMap, localEnv)
    }, env.sinks)
  }, env)

  await Promise.all(integrate(netMap, {
    inputer: async (_id, value, xf) => {
      if (value.type !== 'source') {
        return
      }

      const type = value.value?.type
      const transformer = xf(t.count())

      if (type === 'pipe') {
        return setPipe(env.pipes, value.value?.name, transformer)
      }

      const source = localEnv.sources[type] ?? defaultSource(type)
      for await (const x of source(value.value)) {
        if (isReduced(step(transformer, undefined, x))) {
          return
        }
      }

      result(transformer, undefined)
    },

    outputer: (_id, value) => {
      if (value.type !== 'sink') {
        return []
      }

      const type = value.value?.type
      const sink = type === 'pipe'
        ? getPipe(env.pipes, value.value?.name)
        : localEnv.sinks[type] ?? defaultSink(type)
      return [t.map(sink)]
    }
  }))
}

const run = (netMap, ...argv) =>
  runNet(netMap, {
    // A source is a map of async iterables that emit a sequence of values
    sources: {
      init: async function * () {
        yield { env: process.env, argv }
      },

      time: async function * ({ freq }) {
        while (true) {
          yield Date.now()
          await new Promise(resolve => setTimeout(resolve, freq))
        }
      },

      dir: async function * ({ path }) {
        yield `Opening ${path}`
        const dir = await opendir(path)
        for await (const dirent of dir) {
          yield dirent
        }
      }
    },

    // A sink is a map of functions* that perform side effects.
    // *technically, procedures and not functions.
    sinks: {
      log: console.log,
      debug: console.debug,
      dir: console.dir
    },

    pipes: {}
  })

module.exports = { run }
