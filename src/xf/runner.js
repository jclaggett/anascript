// Purpose of this namespace is to introduce source and sink concepts to
// transducer graphs and to provide runners that 'transduce' values from
// sources into sinks via a given graph.
import { opendir } from 'fs/promises'
import * as r from './reducing.js'
import { composeGraph } from './xfgraph.js'

// Use derive to make efficient clones of nested environments.
const derive = Object.setPrototypeOf

const call = (f) => [
  r.transducer(_rf => ({
    [r.STEP]: (a, x) => {
      f(x)
      return a
    }
  }))
]

export const sinks = {
  debug: () => call(console.debug),
  log: () => call(console.log),
  call
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

export const sources = {
  init: () => [
    r.transducer(rf => ({
      [r.STEP]: async (a, x) => rf[r.STEP](a, x)
    }))
  ],

  timer: (ms) => [
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
    }
    )
  ],

  dir: (path) => [
    r.transducer(rf => ({
      [r.STEP]: async (a, _x) => {
        const dir = await opendir(path)
        for await (const dirent of dir) {
          a = rf[r.STEP](a, dirent)
        }
        return a
      }
    }))
  ]
}

const makeEdgeFn = (edgeType, edges) =>
  (_path, value) => {
    if (Array.isArray(value)) {
      const [et, name, ...args] = value
      return ((et === edgeType) && (edges[name] != null))
        ? edges[name](...args)
        : []
    } else {
      return []
    }
  }

const makePipeSource = (pipes) =>
  (name) => [
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
  ]

const makePipeSink = (pipes) =>
  (name) => [
    r.transducer(rf => {
      return {
        [r.STEP]: (a, x) => {
          setImmediate(() => {
            if (pipes[name] != null) {
              pipes[name].send(x)
            }
          })
          return a
        },
        [r.RESULT]: (a) => {
          return rf[r.RESULT](a)
        }
      }
    })
  ]

const makeRunSink = (childPromises, initValue, sources, sinks, pipes) =>
  () => [
    r.transducer(rf => {
      return {
        [r.STEP]: (a, x) => {
          childPromises.push(runGraph(x, initValue, sources, sinks, pipes))
          return rf[r.STEP](a, x)
        }
      }
    })
  ]

const runGraph = async (g, initValue, sources, sinks, pipes) => {
  const childPromises = []
  const pipes2 = derive({}, pipes)

  const sources2 = derive({
    pipe: makePipeSource(pipes2)
  }, sources)

  const sinks2 = derive({
    run: makeRunSink(childPromises, initValue, sources, sinks, pipes2),
    pipe: makePipeSink(pipes2)
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
