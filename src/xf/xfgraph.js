// Purpose of this namespace is to apply tranducers to graphs and is marked
// with the assumption that node values are either transducers or are treated
// as identity (i.e., a trivial transducer).

const t = require('transducist')

const { transducer, STEP } = require('./reducing')
const { tag, detag, multiplex, demultiplex } = require('./xflib')
const { $, graph, walk } = require('./graph')
const { identity } = require('./util')

// Walk a graph of transducers using multiplex and demultiplex to combine
// idividual transducers into a 'reduced' set of transducers. Use `leafFn` and
// `rootFn` at the edges of the graph to provide initial reducers and to return
// finished values respectively.
const composeGraph = (g, { rootFn, leafFn }) =>
  walk(g, (xfs, xf, { root, leaf, path, parentPaths }) => {
    // Stage 1: leaf nodes
    if (leaf) {
      xfs = leafFn(path, xf)
    } else {
      xfs = xfs.flatMap(identity)
    }

    // Stage 2: multiplex
    if ((typeof xf === 'function') && (xf !== identity) && (xfs.length > 0)) {
      xfs = [t.compose(xf, multiplex(xfs))]
    }

    // Stage 3: demultiplex
    if (parentPaths.length > 1) {
      xfs = xfs.map(xf => t.compose(demultiplex(parentPaths.length), xf))
    }

    // Stage 4: root nodes
    if (root && xfs.length > 0) {
      xfs = rootFn(path, xf, multiplex(xfs))
    }

    return xfs
  })

// xfgraph: a transducer constructor that builds a unified transducer from `graph`.
const xfgraph = (g) =>
  multiplex(
    composeGraph(g, {
      rootFn: ([name], _value, xf) => t.compose(detag(name), xf),
      leafFn: ([name], _value) => [tag(name)]
    }))

// mapjoin: return a graph that joins multiple inputs as arguments to `f`.
// `actives` describes which inputs generate new calls to `f` when new values
// are received.
const mapjoinXf = (f, actives) =>
  transducer(r => {
    const joined = new Array(actives.length)
    const needed = new Set(actives.keys())
    return {
      [STEP]: (a, [i, v]) => {
        joined[i] = v

        let active = actives[i]
        if (needed.has(i)) {
          needed.delete(i)
          active = true
        }

        if (active && needed.size === 0) {
          a = r[STEP](a, f(...joined))
        }
        return a
      }
    }
  })

const mapjoin = (f, actives) =>
  graph({
    ...actives.map((_, i) => t.map(x => [i, x])),
    out: mapjoinXf(f, actives)
  },
  actives.map((_, i) => [$[i], $.out]))

// chain: return a graph of transducers chained together with 'in' and 'out'
// nodes at the top and bottom. Very similar to `compose`.
const chain = (xfs) =>
  graph({
    in: identity,
    ...xfs,
    out: identity
  }, [
    [$.in, $[0]],
    ...xfs.slice(1).map((_, i) => [$[i], $[i + 1]]),
    [$[xfs.length - 1], $.out]
  ])

module.exports = { chain, composeGraph, mapjoin, xfgraph }
