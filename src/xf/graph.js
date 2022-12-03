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
      const path = normalizePath($[name], g, dir)
      const rootPaths = getPaths(g, dir, path)
      return rootPaths.size === 0
        ? path
        : null
    })
    .filter(path => path != null))

const prewalk = (rootPaths, getChildPaths) => {
  const cycleChecker = new CycleChecker()
  const prewalkNode = (result, [path, parentPath]) => {
    console.dir({ result, path, parentPath })
    const childPaths = getChildPaths(path)

    result.allParentPaths = updateIn(result.allParentPaths, path,
      x => x == null
        ? new Set(parentPath == null ? [] : [parentPath])
        : x.add(parentPath))
    result.allChildPaths = setIn(result.allChildPaths, path, childPaths)

    cycleChecker.push(path)
    result = Array.from(childPaths)
      .map(childPath => [childPath, path])
      .reduce(prewalkNode, result)
    cycleChecker.pop()

    return result
  }

  return rootPaths
    .map(path => [path])
    .reduce(prewalkNode, {})
}

const walk = (g, walkFn, in2out = true) => {
  const [rootDir, leafDir] = in2out
    ? ['in', 'out']
    : ['out', 'in']
  console.dir({ rootDir, leafDir })
  const rootPaths = getEdgePaths(g, rootDir)
  const leafPaths = getEdgePaths(g, leafDir)
  const rootPaths2 = Array.from(rootPaths) // .map and .reduce don't work on sets :-(
  console.dir({ rootPaths, leafPaths, rootPaths2 })
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
            [rootDir]: parentPaths,
            [leafDir]: childPaths
          }))
    }

    return walked
  }

  const walked = rootPaths2.reduce(walkNode, {})
  return rootPaths2.map(path => getIn(walked, path))
}

module.exports = { $, graph, isGraphable, getGraph, walk }
