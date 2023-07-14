// Purpose of this namespace is to apply tranducers to graphs and is marked
// with the assumption that node values are either transducers or are treated
// as identity (i.e., a trivial transducer).

import { transducer, STEP } from './reducing.js'
import { map, tag, detag, multiplex, demultiplex } from './xflib.js'
import { $ } from './pathref.js'
import { graph, walk } from './graph.js'
import { identity, compose } from './util.js'

// Walk a graph of transducers using `multiplex` and `demultiplex` to combine
// idividual transducers into a 'reduced' set of transducers. Use `leafFn` to
// provide zero or more sink transducers (i.e., causes side effects.). Use
// `rootFn` to provide zero or more source transducers (i.e., responds to side
// effects.). The source transducers returned are also assumed to be defined
// with asynchronous STEP functions.
export const composeGraph = (g, { rootFn, leafFn }) =>
  walk(g, (xfs, node, { root, leaf, path, parentPaths }) => {
    // Stage 1: leaf nodes
    if (leaf) {
      xfs = leafFn(path, node)
    } else {
      xfs = xfs.flatMap(identity)
    }

    // Stage 2: multiplex
    if ((typeof node === 'function') && (node !== identity) && (xfs.length > 0)) {
      xfs = [compose(node, multiplex(xfs))]
    }

    // Stage 3: demultiplex
    if (parentPaths.length > 1) {
      xfs = xfs.map(xf => compose(demultiplex(parentPaths.length), xf))
    }

    // Stage 4: root nodes
    if (root && xfs.length > 0) {
      const leafXf = multiplex(xfs)
      xfs = rootFn(path, node).map(rootXf => compose(rootXf, leafXf))
    }

    return xfs
  }).flatMap(identity)

// xfgraph: a transducer constructor that builds a unified transducer from `graph`.
export const xfgraph = (g) => {
  const xfs = composeGraph(g, {
    leafFn: ([name], _value) => [tag(name)],
    rootFn: ([name], _value) => [detag(name)]
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
    ...actives.map((_, i) => map(x => [i, x])),
    out: xf
  },
    actives.map((_, i) => [$[i], $.out]))
}
