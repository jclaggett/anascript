// Purpose of this namespace is to introduce source and sink concepts to
// transducer graphs and to provide runners that 'transduce' values from
// sources into sinks via a given graph.

const { opendir } = require('fs/promises')

const t = require('transducist')

const { isReduced, INIT, STEP, RESULT, unreduced } = require('./reducing')
const { composeGraph } = require('./xfgraph')

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
  (x) => console.warn(
    `Unknonwn or closed pipe ${name}. ignoring:`, x)

const setPipe = (pipes, name, reducer) => {
  pipes[name] = (x) =>
    setImmediate(() => {
      if (isReduced(reducer[STEP](undefined, x))) {
        pipes[name] = undefined
      }
    })
}

const getPipe = (pipes, name) =>
  (x) => ((pipes[name] == null)
    ? defaultPipe(name)
    : pipes[name])(x)

// Use derive to make efficient clones of nested environments.
const derive = Object.setPrototypeOf

// run a graph within parentEnv
const runGraph = async (g, parentEnv) => {
  const env = {
    sources: derive({}, parentEnv.sources),
    sinks: derive({ run: (g) => runGraph(g, env) }, parentEnv.sinks),
    pipes: derive({}, parentEnv.pipes)
  }

  await Promise.all(composeGraph(g, {
    // Returns an 'Array of transducers'. In practice, it either returns an
    // empty array or an array containing a single map transducer applying a
    // sink function.
    leafFn: (_path, value) => {
      if (!isSink(value)) {
        return []
      }

      const type = value[1]
      const sink = (type === 'pipe'
        ? getPipe(env.pipes, value[2])
        : env.sinks[type] ?? defaultSink(type))
      return [t.map(sink)]
    },

    // Returns a Promise that completes when the source async iterator ends or
    // the reducer is done.
    rootFn: async (_path, value, xf) => {
      if (!isSource(value)) {
        return
      }

      const type = value[1]
      const reducer = xf(t.count()) // Convert the transducer into a reducer here!

      // TODO setPipe should return a source?
      if (type === 'pipe') {
        return setPipe(env.pipes, value[2], reducer)
      }
      const source = env.sources[type] ?? defaultSource(type)

      let accumulatedValue = reducer[INIT]()
      for await (const x of source(value[2])) {
        accumulatedValue = reducer[STEP](accumulatedValue, x)
        if (isReduced(accumulatedValue)) {
          accumulatedValue = unreduced(accumulatedValue)
          break // Stop once the reducer is done
        }
      }

      // Always call result when source is done or when reducer is reduced.
      return reducer[RESULT](accumulatedValue)
    }
  }))
}

// run a graph defining argv as following parameters after the graph
const run = (g, ...argv) =>
  runGraph(g, { // this is the root env
    // Each source is an async iterable that emits a sequence of values.
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
        const dir = await opendir(path)
        for await (const dirent of dir) {
          yield dirent
        }
      }
    },

    // Each sink is a function that performs side effects on its given argument.
    // The return value of a sink is ignored.
    sinks: {
      log: console.log,
      debug: console.debug,
      process: (fn) => fn(process)
    },

    pipes: {}
  })

// define sources and sinks
const source = (...value) => ['source', ...value]
const sink = (...value) => ['sink', ...value]

const isSource = (x) => Array.isArray(x) && x[0] === 'source'
const isSink = (x) => Array.isArray(x) && x[0] === 'sink'

module.exports = { run, source, sink }
