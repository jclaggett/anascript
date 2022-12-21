const util = require('util')
const { isEmpty, last } = require('./util')
const {
  $, pathRefToArray, pathRefToString, arrayToPathRef, isPathRef
} = require('./pathref')

// Graphable Protocol
const graphable = Symbol('graph')
const isGraphable = (x) => x instanceof Object && graphable in x

const Graph = {
  [graphable]: function () { return this }
}

const getGraph = (x) =>
  x[graphable]()

// General Code
const updateIn = (x, [name, ...path], f) => {
  if (name == null) {
    x = f(x)
  } else {
    if (x == null) {
      x = {}
    }
    x[name] = updateIn(x[name], path, f)
  }
  return x
}

const setIn = (x, path, value) =>
  updateIn(x, path, _ => value)

const getIn = (x, [name, ...path]) =>
  (name == null || x == null)
    ? x
    : getIn(x[name], path)

const getNode = (x, [name, ...subpath]) =>
  (name == null)
    ? x
    : getNode(getGraph(x).nodes[name], subpath)

const getAliasedPath = (nodes, path, previousAliases = new Set()) => {
  const [name, ...subpath] = path
  const node = nodes[name]
  return isPathRef(node)
    ? previousAliases.has(node)
      ? [] // if an alias loop is encountered.
      : getAliasedPath(
        nodes,
        pathRefToArray(node).concat(subpath),
        previousAliases.add(node))
    : path
}

// Defining Graphs
const addPath = (paths, [name, ...path], targetPath) => {
  if (name == null) {
    if (paths == null) {
      paths = new Set()
    }
    paths.add(pathRefToArray(arrayToPathRef(targetPath)))
  } else {
    if (paths == null) {
      paths = {}
    }
    paths[name] = addPath(paths[name], path, targetPath)
  }
  return paths
}

const isBadPath = (path) =>
  last(path) instanceof Error

const normalizePath = (nodes, dir, path) => {
  let newPath = getAliasedPath(nodes, path)
  const [name, ...subpath] = newPath
  const node = nodes[name]
  if (isGraphable(node)) {
    newPath = [name,
      ...normalizePath(getGraph(node).nodes, dir, isEmpty(subpath) ? [dir] : subpath)]
  } else if (node == null) {
    newPath = [new Error('missing node')]
  } else if (!isEmpty(subpath)) {
    newPath = [new Error('path into non-graph node')]
  }
  return newPath
}

const addLink = (g, [src, dst]) => {
  const srcPath = normalizePath(g.nodes, 'out', pathRefToArray(src))
  if (isBadPath(srcPath)) {
    throw new Error(`Invalid source ref: ${pathRefToString(src)}`)
  }

  const dstPath = normalizePath(g.nodes, 'in', pathRefToArray(dst))
  if (isBadPath(dstPath)) {
    throw new Error(`Invalid destination ref: ${pathRefToString(dst)}`)
  }

  g.out = addPath(g.out, srcPath, dstPath)
  g.in = addPath(g.in, dstPath, srcPath)

  return g
}

const graph = (nodes = {}, links = []) =>
  links.reduce(addLink,
    Object.setPrototypeOf({ nodes, in: {}, out: {} },
      Graph))

// chain: return a graph of values chained together with 'in' and 'out' nodes
// at the top and bottom. Very similar to `compose`.
const chain = (...xfs) =>
  graph({
    ...xfs,
    in: $[0],
    out: $[xfs.length - 1]
  }, xfs.slice(1).map((_, i) => [$[i], $[i + 1]]))

// Walking Graphs
const pushCycleCheck = (cycle, x) => {
  if (cycle.set.has(x)) {
    const cycleIndex = cycle.stack.findIndex(y => x === y)
    const nodeStr = util.inspect(cycle.stack
      .slice(cycleIndex)
      .map(x => ['$', ...x].join('.')))
    throw new Error(`Cycle detected when walking graph: ${nodeStr}`)
  }

  cycle.set.add(x)
  cycle.stack.push(x)
  return cycle
}

const popCycleCheck = (cycle) => {
  cycle.set.delete(
    cycle.stack.pop())
  return cycle
}

const getPaths = (g, dir, path, ref = $) => {
  const [name, ...subpath] = path
  const paths = getIn(g[dir], path)
  return new Set([
    ...(paths != null
      ? Array.from(paths, path => pathRefToArray(arrayToPathRef(path, ref)))
      : []),
    ...(isGraphable(g.nodes[name])
      ? getPaths(getGraph(g.nodes[name]), dir, subpath, ref[name])
      : [])])
}

const getEdgePaths = (g, dir) =>
  new Set(Object.keys(g.nodes)
    .map(name => {
      const path = normalizePath(g.nodes, dir, [name])
      return (!isBadPath(path) && getPaths(g, dir, path).size === 0
        ? pathRefToArray(arrayToPathRef(path))
        : null)
    })
    .filter(path => path != null))

const prewalk = (rootPaths, getChildPaths) => {
  const prewalkNode = (result, [path, parentPath]) => {
    const childPaths = getChildPaths(path)

    result.allParentPaths = updateIn(result.allParentPaths, path,
      x => x == null
        ? new Set(parentPath == null ? [] : [parentPath])
        : x.add(parentPath))
    result.allChildPaths = setIn(result.allChildPaths, path, childPaths)

    result.cycle = pushCycleCheck(result.cycle, path)
    result = Array.from(childPaths)
      .map(childPath => [childPath, path])
      .reduce(prewalkNode, result)
    result.cycle = popCycleCheck(result.cycle)

    return result
  }

  return rootPaths
    .map(path => [path])
    .reduce(prewalkNode, {
      cycle: {
        stack: [],
        set: new Set()
      }
    })
}

const walk = (g, walkFn, in2out = true) => {
  const [rootDir, leafDir] = in2out
    ? ['in', 'out']
    : ['out', 'in']
  const rootPaths = getEdgePaths(g, rootDir)
  const leafPaths = getEdgePaths(g, leafDir)
  const rootPaths2 = Array.from(rootPaths) // .map and .reduce don't work on sets :-(
  const { allParentPaths, allChildPaths } = prewalk(
    rootPaths2, (path) => getPaths(g, leafDir, path))
  const walkNode = (walked, path) => {
    if (getIn(walked, path) === undefined) {
      const parentPaths = Array.from(getIn(allParentPaths, path))
      const childPaths = Array.from(getIn(allChildPaths, path))

      walked = childPaths.reduce(walkNode, walked)
      walked = setIn(walked, path,
        walkFn(
          childPaths.map(path => getIn(walked, path)),
          getNode(g, path), {
            path,
            graph: g,
            root: rootPaths.has(path),
            leaf: leafPaths.has(path),
            parentPaths,
            childPaths
          }))
    }

    return walked
  }

  const walked = rootPaths2.reduce(walkNode, {})
  return rootPaths2.map(path => getIn(walked, path))
}

const pg = (g, options = {}) =>
  console.dir(g, { colors: true, depth: 5, ...options })

module.exports = { $, chain, getGraph, graph, isGraphable, pg, walk }
