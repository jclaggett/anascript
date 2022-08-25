import { last, butLast } from './core.mjs'

// References
const nodeRef = (path) => {
  const ref = new Proxy({}, {
    get: (_, name) =>
      name === '@@path'
        ? path
        : nodeRef([...path, name])
  })
  return ref
}

export const $ = nodeRef([])

const getFullId = (r) =>
  r['@@path']

const normalizeRefs = (x) =>
  x instanceof Array
    ? x.flatMap(normalizeRefs)
    : [getFullId(x)]

// Making a netMap

const getNode = (netMap, [id, ...path]) =>
  path.length === 0
    ? netMap[id]
    : getNode(netMap[id].net, path)

const pushValue = (obj, key, value) => {
  if (obj[key] === undefined) {
    obj[key] = []
  }
  obj[key].push(value)
  return obj
}

const connectNode = (netMap, a, b, dir) => {
  if (a.length > 1) {
    pushValue(netMap[a[0]][dir], a[1], b)
  } else {
    netMap[a[0]][dir].push(b)
  }
  return netMap
}

const normalizeEmbedRef = (netMap, x) =>
  getNode(netMap, x).type === 'embed'
    ? x.concat(['out'])
    : x

const connectNodes = (netMap, a, b) => {
  const a2 = normalizeEmbedRef(netMap, a)
  const b2 = normalizeEmbedRef(netMap, b)
  netMap = connectNode(netMap, a2, b2, 'outputs')
  netMap = connectNode(netMap, b2, a2, 'inputs')
  return netMap
}

const initNetMapEntry = (node) => ({
  ...node,
  ...(node.type === 'embed'
    ? { inputs: {}, outputs: {} }
    : { inputs: [], outputs: [] })
})

const makeNetMap = (netSpec = {}) => {
  const makeNetMapEntry = (netMap, fullId) => {
    const id = fullId[0]

    if (netMap[id] != null) return netMap

    const node = netSpec[id]
    netMap[id] = initNetMapEntry(node)

    return (node.type === 'embed'
      ? Object.entries(node.inputs).map(([inputId, inputs]) =>
        [[id, inputId], normalizeRefs(inputs)])
      : [[fullId, normalizeRefs(node.inputs)]])
      .reduce((netMap, [fullId, inputs]) =>
        inputs.reduce((netMap, fullSubId) =>
          connectNodes(
            makeNetMapEntry(netMap, fullSubId),
            fullSubId,
            fullId),
        netMap),
      netMap)
  }

  return Object
    .keys(netSpec)
    .map(id => [id])
    .reduce(makeNetMapEntry, {})
}

const getWalkedValue = (walked, [id, ...path]) =>
  path.length === 0
    ? walked[id]
    : walked[id] === undefined
      ? undefined
      : getWalkedValue(walked[id], path)

const setWalkedValue = (walked, [id, ...path], value) => {
  if (path.length === 0) {
    walked[id] = value
  } else {
    if (walked[id] === undefined) {
      walked[id] = {}
    }
    setWalkedValue(walked[id], path, value)
  }
  return walked
}

const prependPaths = (basePath) =>
  childPath => basePath.concat(childPath)

export const walk = (netMap, parentKey, walkFn) => {
  const childKey = parentKey === 'inputs' ? 'outputs' : 'inputs'

  const getEmbedChildPaths = (path) => {
    const id = last(path)
    const embedPath = butLast(path)
    const embedNode = getNode(netMap, embedPath)
    return (embedNode == null ? [] : embedNode[childKey][id] ?? [])
      .map(prependPaths(butLast(embedPath)))
  }

  const getChildPaths = (path) =>
    getNode(netMap, path)[childKey]
      .map(prependPaths(butLast(path)))
      .concat(getEmbedChildPaths(path))

  const walkNode = (walked, path) => {
    if (getWalkedValue(walked, path) === undefined) {
      const childPaths = getChildPaths(path)
      walked = childPaths.reduce(walkNode, walked)
      walked = setWalkedValue(walked, path,
        walkFn(
          last(path),
          getNode(netMap, path),
          getNode(netMap, butLast(path)),
          childPaths.map(path => getWalkedValue(walked, path))))
    }
    return walked
  }

  const rootPaths = Object.entries(netMap)
    .filter(([_, node]) =>
      node.type === 'node' && node[parentKey].length === 0)
    .map(([id]) => [id])

  const walked = rootPaths.reduce(walkNode, {})
  return rootPaths.map(([id]) => walked[id])
}

export const node = (value, inputs = []) => ({ type: 'node', value, inputs })
export const embed = (net, inputs = {}) => ({ type: 'embed', net, inputs })
export const net = makeNetMap
