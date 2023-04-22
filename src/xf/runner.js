// Purpose of this namespace is to introduce source and sink concepts to
// transducer graphs and to provide runners that 'transduce' values from
// sources into sinks via a given graph.
import { opendir } from 'fs/promises'
import EventHandler from 'node:events'

import t from 'transducist'

import { isReduced, INIT, STEP, RESULT, unreduced, ezducer } from './index.js'
import { composeGraph } from './xfgraph.js'

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
    pipes: derive({}, parentEnv.pipes),
    shared: parentEnv.shared
  }

  env.shared.promises = env.shared.promises.concat(composeGraph(g, {
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

const sinks = {
  pipe: (args, context) => {
    const id = args[1]
    const eventName = `pipe_${id}`
    context.pipes[args[1]] = (context.pipes[id] ?? 0) + 1
    // return a transducer
    return ezducer(() => ({
      step: (v) => {
        setImmediate(() => context.ee.emit(eventName, v))
      },

      result: () => {
        context.pipes[id] -= 1
      }
    }))
  },

  out: (_args, _context) =>
    ezducer(() => ({
      step: (v) => console.log(v)
    }))
}

const sources2 = {
  default: (type, _args, context) => {
    console.debug(`DEBUG: unknown source ${type} received`)
    const name = `default-${type}`
    return {
      name,
      start: () => {
        context.ee.removeAllListeners(name)
      }
    }
  }
}

const context = {
  sinks,
  sources: sources2,
  pipes: {},

  ee: new EventHandler(),
  resultFns: new Map()
}

context.ee.on('removeListener', (name, listener) => {
  if (context.resultFns.has(listener)) {
    const accumulatedValue = context.resultFns.get(listener)()
    console.dir({ event: 'removeListener', name, listener, accumulatedValue })
    context.resultFns.delete(listener)
  }
})

const addListener = (ee, resultFns, name, reducer) => {
  // 1. init
  let accumulatedValue = reducer[INIT]()

  // 2. step
  const step = (data) => {
    accumulatedValue = reducer[STEP](accumulatedValue, data)
    if (isReduced(accumulatedValue)) {
      accumulatedValue = unreduced(accumulatedValue)
      ee.off(name, step) // Stop once the reducer is done
    }
  }

  // 3. result
  const result = () =>
    reducer[RESULT](accumulatedValue)

  // associate result to step
  resultFns.set(step, result)
  ee.on(name, step)
}

const runGraph2 = async (g, context) => {
  const sourceSpecs = composeGraph(g, {
    leafFn: (_path, value) => {
      if (!isSink(value)) {
        return []
      }
      if (context.sinks[value[1]] == null) {
        console.warn(`Unknown sink type specified: ${value[1]}`)
        return []
      }
      return [context.sinks[value[1]](value.slice(2), context)]
    },

    rootFn: async (_path, value, xf) => {
      if (!isSource(value)) {
        return
      }
      if (context.sources[value[1]] == null) {
        console.warn(`Unknown source type specified: ${value[1]}`)
        return
      }

      return {
        ...context.sources[value[1]](value.slice(2), context),
        reducer: xf(t.count())
      }
    }
  })

  // add each source to context.ee and context.resultFns
  sourceSpecs.map(({ name, reducer }) =>
    addListener(context.ee, context.resultFns, name, reducer))

  // start each source
  sourceSpecs.map(({ start }) => start())
}

/*
      const type = value[1]
      const reducer = xf(t.count()) // Convert the transducer into a reducer here!
      addListener(context.ee, context.resultFns, name, reducer)

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
      */

// run a graph defining argv as following parameters after the graph
const sources = (argv) => ({
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
})

export const run = async (g, ...argv) => {
  const shared = { promises: [] }
  runGraph(g, {
    // this is the root env
    // Each source is an async iterable that emits a sequence of values.
    sources: sources(argv),

    // Each sink is a function that performs side effects on its given argument.
    // The return value of a sink is ignored.
    sinks: {
      log: console.log,
      debug: console.debug,
      process: (fn) => fn(process)
    },

    pipes: {},

    shared
  })

  const pending = {}
  const pendingPromise = Promise.resolve(pending)

  console.dir(shared)
  while (shared.promises.length > 0) {
    // await for at least one promise to settle
    await Promise.race(shared.promises)
    const pendingPromises = []
    for (const p of shared.promises) {
      if ((await Promise.race([p, pendingPromise])) === pending) {
        pendingPromises.push(p)
      }
    }
    shared.promises = pendingPromises
    console.dir(shared)
  }
}

// define sources and sinks
export const source = (...value) => ['source', ...value]
export const sink = (...value) => ['sink', ...value]

const isSource = (x) => Array.isArray(x) && x[0] === 'source'
const isSink = (x) => Array.isArray(x) && x[0] === 'sink'

// Tasks:
// 1. convert pipes into async generators.
// 2. add sink counting for pipes.
// 3. close pipes when no last sink closes.
