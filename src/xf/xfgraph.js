// Purpose of this namespace is to apply tranducers to graphs and is marked
// with the assumption that node values are either transducers or are treated
// as identity (i.e., a trivial transducer).

import t from 'transducist'

import { transducer, STEP } from './reducing'
import { tag, detag, multiplex, demultiplex } from './xflib'
import { $ } from './pathref'
import { graph, walk } from './graph'
import { identity } from './util'

// Walk a graph of transducers using multiplex and demultiplex to combine
// idividual transducers into a 'reduced' set of transducers. Use `leafFn` and
// `rootFn` at the edges of the graph to provide initial reducers and to return
// finished values respectively.
export const composeGraph = (g, { rootFn, leafFn }) =>
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
export const xfgraph = (g) => {
  const xfs = composeGraph(g, {
    leafFn: ([name], _value) => [tag(name)],
    rootFn: ([name], _value, xf) => t.compose(detag(name), xf)
  })
  return multiplex(xfs)
}

// mapjoin: return a graph that joins multiple inputs as arguments to `f`.
// `actives` describes which inputs generate new calls to `f` when new values
// are received.
export const mapjoin = (f, actives) => {
  const xf = transducer(r => {
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

  return graph({
    ...actives.map((_, i) => t.map(x => [i, x])),
    out: xf
  },
  actives.map((_, i) => [$[i], $.out]))
}
