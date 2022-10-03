const { last, butLast } = require('./util')
const { $, normalizeRefs } = require('./pathref')

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

/*
embed(foo, {
  bar: $.bar1,
  baz: {
    biz: $.bar1
  }
})

[
  [['foo', 'bar'], $.bar1],
  [['foo', 'baz', 'biz'], $.bar1]
]
*/

const getEmbedRefs = (inputs, id) =>
  Object.entries(inputs)
    .flatMap(([inputId, inputRefs]) =>
      Array.isArray(inputRefs)
        ? [[id.concat(inputId), inputRefs]]
        : getEmbedRefs(inputRefs, id.concat(inputId)))

const getInputRefs = (node, nodeId) =>
  node.type === 'embed'
    ? getEmbedRefs(node.inputs, nodeId)
    : [[nodeId, node.inputs]]

const validateRef = (netSpec, id) =>
  (ref) => {
    const node = netSpec[ref[0]]

    if (node == null ||
      (node.type === 'node' &&
        ref.length > 1) ||
      (node.type === 'embed' &&
        getNode(node.net, ref.slice(1)) == null &&
        getNode(node.net, ref.slice(1).concat(['out'])) == null)) {
      throw new Error(`Unknown node $.${ref.join('.')} referenced by node ${id}.`)
    }

    return ref
  }

const net = (netSpec = {}) => {
  const makeNetMapEntry = (netMap, nodeId) => {
    const nodeId0 = nodeId[0]

    if (netMap[nodeId0] != null) return netMap

    const node = netSpec[nodeId0]
    netMap[nodeId0] = initNetMapEntry(node)

    netMap = getInputRefs(node, nodeId)
      .reduce((netMap, [nodeId, inputsNodeIds]) =>
        normalizeRefs(inputsNodeIds)
          .map(validateRef(netSpec, nodeId))
          .reduce((netMap, inputNodeId) =>
            connectNodes(
              makeNetMapEntry(netMap, inputNodeId),
              inputNodeId,
              nodeId),
          netMap),
      netMap)

    return netMap
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

const walk = (netMap, walkFn) => {
  // For now, always walk from inputs to outputs
  const parentKey = 'inputs'
  const childKey = 'outputs'

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

const node = (value, inputs = []) => ({ type: 'node', value, inputs })
const embed = (net, inputs = {}) => ({ type: 'embed', net, inputs })

module.exports = { $, node, embed, net, walk }
