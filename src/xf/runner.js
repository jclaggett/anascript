// Purpose of this namespace is to introduce source and sink concepts to
// transducer graphs and to provide runners that 'transduce' values from
// sources into sinks via a given graph.
import { opendir } from 'fs/promises'
import * as r from './reducing.js'
import { composeGraph } from './xfgraph.js'

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

export const sources = {
  init: () =>
    r.transducer(rf => ({
      [r.STEP]: async (a, x) => rf[r.STEP](a, x)
    })),

  timer: (ms) =>
    r.transducer(rf => {
      return {
        [r.STEP]: async (a, _x) => {
          let then = Date.now()
          while (!r.isReduced(a)) {
            await sleep(ms - (Date.now() - then))
            then = Date.now()
            a = rf[r.STEP](a, then)
            then += 1
          }
          return a
        }
      }
    }),

  dir: (path) =>
    r.transducer(rf => ({
      [r.STEP]: async (a, _x) => {
        const dir = await opendir(path)
        for await (const dirent of dir) {
          a = rf[r.STEP](a, dirent)
        }
        return a
      }
    }))
}

const pipeSourceConstructor = (pipes) =>
  (name) =>
    r.transducer(rf => {
      return {
        [r.STEP]: async (a, _x) => {
          await new Promise((resolve) => {
            const close = () => {
              delete pipes[name]
              resolve()
            }
            const send = (x) => {
              if (r.isReduced(rf[r.STEP](a, x))) {
                close()
              }
            }
            pipes[name] = { close, send }
          })
          return a
        }
      }
    })

// Special 'sink' transducer that calls f(x) each STEP without calling down to the next STEP.
// f(x) is assumed to perform a side effect of some kind.
const callSink = (f) =>
  r.transducer(_ => ({
    [r.STEP]: (a, x) => {
      f(x)
      return a
    }
  }))

const pipeSinkConstructor = (pipes) =>
  (name) =>
    callSink((x) =>
      setImmediate(() => {
        if (pipes[name] != null) {
          pipes[name].send(x)
        }
      }))

const runSinkConstructor = (childPromises, initValue, sources, sinks, pipes) =>
  () =>
    callSink((x) => childPromises.push(
      runGraph(x, initValue, sources, sinks, pipes)))

export const sinks = {
  debug: () => callSink(console.debug),
  log: () => callSink(console.log),
  call: callSink
}

const makeEdgeFn = (edgeType, edges) =>
  (_path, value) => {
    if (Array.isArray(value)) {
      const [et, name, ...args] = value
      return ((et === edgeType) && (edges[name] != null))
        ? [edges[name](...args)]
        : []
    } else {
      return []
    }
  }

// Use derive to make efficient clones of nested environments.
const derive = Object.setPrototypeOf

const runGraph = async (g, initValue, sources, sinks, pipes) => {
  const childPromises = []
  const pipes2 = derive({}, pipes)

  const sources2 = derive({
    pipe: pipeSourceConstructor(pipes2)
  }, sources)

  const sinks2 = derive({
    run: runSinkConstructor(childPromises, initValue, sources, sinks, pipes2),
    pipe: pipeSinkConstructor(pipes2)
  }, sinks)

  const xfs = composeGraph(g, {
    leafFn: makeEdgeFn('sink', sinks2),
    rootFn: makeEdgeFn('source', sources2)
  })

  const rf = r.nullReducer
  const a = rf[r.INIT]()
  const rfs = xfs.map(xf => xf(rf))

  await Promise.all(rfs.map(async rf => {
    const a2 = await rf[r.STEP](a, initValue)
    return rf[r.RESULT](r.unreduced(a2))
  }))

  await Promise.all(childPromises)
}

export const makeRun = (initValue, sources, sinks) =>
  (g, ...argv) => runGraph(g, { ...initValue, argv }, sources, sinks, {})

export const run = makeRun({ env: process.env }, sources, sinks)

// define sources and sinks
export const source = (...value) => ['source', ...value]
export const sink = (...value) => ['sink', ...value]
