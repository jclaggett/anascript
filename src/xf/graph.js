const util = require('util')
const {
  $, pathRefToArray, pathRefToString, arrayToPathRef
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
const setIn = (x, [name, ...path], value) => {
  if (name == null) {
    x = value
  } else {
    if (x == null) {
      x = {}
    }
    x[name] = setIn(x[name], path, value)
  }
  return x
}

const getIn = (x, [name, ...path]) =>
  (name == null || x == null)
    ? x
    : getIn(x[name], path)

const getNode = (x, [name, ...subpath]) =>
  (name == null)
    ? x
    : isGraphable(x)
      ? getNode(getGraph(x).nodes[name], subpath)
      : null

const normalizePath = (pathRef, g, dir) => {
  // This takes a pathRef and returns either the same or new pathPath or null.
  const node = getNode(g, pathRefToArray(pathRef))
  if (node == null) {
    pathRef = null
  } else if (isGraphable(node)) {
    pathRef = normalizePath(pathRef[dir], g, dir)
  }
  return pathRefToArray(pathRef)
}

// Defining Graphs
const addPath = (paths, [name, ...path], targetPath) => {
  if (name == null) {
    if (paths == null) {
      paths = new Set()
    }
    paths.add(targetPath)
  } else {
    if (paths == null) {
      paths = {}
    }
    paths[name] = addPath(paths[name], path, targetPath)
  }
  return paths
}

const addLink = (g, [src, dst]) => {
  const srcPath = normalizePath(src, g, 'out')

  if (srcPath == null) {
    throw new Error(`Invalid source ref: ${pathRefToString(src)}`)
  }
  const dstPath = normalizePath(dst, g, 'in')
  if (dstPath == null) {
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

// Walking Graphs
class CycleChecker {
  constructor () {
    this.array = []
    this.set = new Set()
  }

  push (x) {
    if (this.set.has(x)) {
      const cycleIndex = this.array.findIndex(y => x === y)
      const nodeStr = util.inspect(this.array
        .slice(cycleIndex)
        .map(x => ['$', ...x].join('.')))
      throw new Error(`Cycle detected when walking graph: ${nodeStr}`)
    }

    this.set.add(x)
    this.array.push(x)
    return -1
  }

  pop () {
    this.set.delete(
      this.array.pop())
  }
}

const isEdgePath = (path, dir) =>
  path.slice(1).every(name => name === dir)

const getPaths = (path, g, dir, ref = $) => {
  const [name, ...subpath] = path
  const paths = getIn(g[dir], path)
  return new Set([
    ...(paths != null
      ? Array.from(paths, path => pathRefToArray(arrayToPathRef(path, ref)))
      : []),
    ...(isGraphable(g.nodes[name])
      ? getPaths(subpath, getGraph(g.nodes[name]), dir, ref[name])
      : [])])
}

const walk = (g, walkFn, in2out = true) => {
  const [rootDir, leafDir] = in2out
    ? ['in', 'out']
    : ['out', 'in']
  const cycleChecker = new CycleChecker()

  const walkNode = (walked, path) => {
    if (getIn(walked, path) === undefined) {
      const rootPaths = getPaths(path, g, rootDir)
      const leafPaths = getPaths(path, g, leafDir)
      const leafPathsArray = Array.from(leafPaths)

      cycleChecker.push(path)
      walked = leafPathsArray.reduce(walkNode, walked)
      cycleChecker.pop()

      walked = setIn(walked, path,
        walkFn(
          leafPathsArray.map(path => getIn(walked, path)),
          getNode(g, path),
          {
            path,
            g,
            root: isEdgePath(path, rootDir) && rootPaths.size === 0,
            leaf: isEdgePath(path, leafDir) && leafPaths.size === 0
          }))
    }

    return walked
  }

  const rootPaths = Object.keys(g.nodes)
    .map(name => {
      const path = normalizePath($[name], g, rootDir)
      const rootPaths = getPaths(path, g, rootDir)
      return rootPaths.size === 0
        ? path
        : null
    })
    .filter(path => path != null)

  const walked = rootPaths.reduce(walkNode, {})
  return rootPaths.map(path => getIn(walked, path))
}

module.exports = { $, graph, isGraphable, getGraph, walk }
