const isPair = (id) =>
  id instanceof Array

const pushValue = (obj, key, value) => {
  if (obj[key] === undefined) {
    obj[key] = []
  }
  obj[key].push(value)
  return obj
}

const connectNode = (netMap, a, b, dir) => {
  if (isPair(a)) {
    pushValue(netMap.nodes[a[0]][dir], a[1], b)
  } else {
    netMap.nodes[a][dir].push(b)
  }
  return netMap
}

const connectNodes = (netMap, a, b) => {
  netMap = connectNode(netMap, a, b, 'outputs')
  netMap = connectNode(netMap, b, a, 'inputs')
  return netMap
}

const initNetMapEntry = (node) => ({
  ...node,
  ...(node.type === 'embed'
    ? { inputs: {}, outputs: {} }
    : { inputs: [], outputs: [] })
})

const makeNetMap = (id, netSpec = {}) => {
  const makeNetMapEntry = (netMap, fullId) => {
    const id = isPair(fullId) ? fullId[0] : fullId

    if (netMap.nodes[id] != null) return netMap

    const node = netSpec[id]

    if (node.type === 'input') netMap.inputs.push(id)
    if (node.type === 'output') netMap.outputs.push(id)

    netMap.nodes[id] = initNetMapEntry(node)

    return (node.type === 'embed'
      ? Object.entries(node.inputs).map(([inputId, inputs]) =>
        [[id, inputId], inputs])
      : [[fullId, node.inputs]])
      .reduce((netMap, [fullId, inputs]) =>
        inputs.reduce((netMap, fullSubId) =>
          connectNodes(
            makeNetMapEntry(netMap, fullSubId), fullSubId, fullId),
        netMap),
      netMap)
  }

  return Object
    .entries(netSpec)
    .filter(entry => entry[1].type === 'output')
    .map(entry => entry[0])
    .reduce(makeNetMapEntry, { id, nodes: {}, inputs: [], outputs: [] })
}

const input = () => ({ type: 'input', inputs: [] })
const node = (value, ...inputs) => ({ type: 'node', value, inputs })
const output = (...inputs) => ({ type: 'output', inputs })
const embed = (net, inputs) => ({ type: 'embed', net, inputs })
const net = makeNetMap

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

const isUnwalked = (walked, path) =>
  getWalkedValue(walked, path) === undefined

const getNode = (netMap, [id, ...path]) =>
  path.length === 0
    ? netMap.nodes[id]
    : getNode(netMap.nodes[id].net, path)

const walk = (netMap, parentKey, walkFn) => {
  const childKey = parentKey === 'inputs' ? 'outputs' : 'inputs'
  const exitingType = parentKey === 'inputs' ? 'output' : 'input'

  const getChildPaths = (nodePath) => {
    const node = getNode(netMap, nodePath)
    let childIds = node[childKey]
    let childPath = nodePath.slice(0, -1)

    if (node.type === exitingType && nodePath.length > 1) {
      const nodeId = nodePath[nodePath.length - 1]
      const embedNode = getNode(netMap, childPath)
      childIds = embedNode[childKey][nodeId]
      childPath = nodePath.slice(0, -2) // Go Up
    }

    return childIds
      .map(childId =>
        isPair(childId)
          ? [...childPath, ...childId] // Go Down
          : [...childPath, childId])
  }

  const walkNode = (walked, path) => {
    if (isUnwalked(walked, path)) {
      const childPaths = getChildPaths(path)
      walked = childPaths.reduce(walkNode, walked)
      walked = setWalkedValue(walked, path,
        walkFn(
          path,
          getNode(netMap, path),
          childPaths.map(path => getWalkedValue(walked, path))))
    }
    return walked
  }

  return netMap[parentKey]
    .map(id => [id])
    .reduce(walkNode, {})
}

module.exports = {
  embed,
  input,
  net,
  node,
  output,
  walk
}
