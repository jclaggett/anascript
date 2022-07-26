class GenericNode {
  constructor (id) {
    this.id = id
    this.inputs = []
  }
}

class InputNode extends GenericNode {
  constructor (id) {
    super(id)
    this.type = 'input'
  }
}

class InternalNode extends GenericNode {
  constructor (id, value, inputs) {
    super(id)
    this.type = 'node'
    this.inputs = inputs
    this.value = value
  }
}

class OutputNode extends GenericNode {
  constructor (id, inputs) {
    super(id)
    this.type = 'output'
    this.inputs = inputs
  }
}

const makeNetMapEntry = (netMap, node) => {
  netMap.nodes[node.id] = {
    type: node.type,
    value: node.value,
    inputs: [],
    outputs: []
  }

  if (node.type === 'input') netMap.inputs.push(node.id)
  if (node.type === 'output') netMap.outputs.push(node.id)

  return node.inputs.reduce(
    (netMap, subnode) => {
      if (netMap.nodes[subnode.id] == null) {
        netMap = makeNetMapEntry(netMap, subnode)
      }

      netMap.nodes[subnode.id].outputs.push(node.id)
      netMap.nodes[node.id].inputs.push(subnode.id)
      return netMap
    },
    netMap)
}

const makeNetMap = (id, inputs) => {
  const netMap = {
    id,
    inputs: [],
    nodes: {},
    outputs: []
  }
  return inputs.reduce(makeNetMapEntry, netMap)
}

const walkNetMap = (netMap, rootKey, walkFn) => {
  const childKey = rootKey === 'outputs' ? 'inputs' : 'outputs'

  const walkNetMapNode = (walked, id) => {
    if (walked[id] == null) {
      const node = netMap.nodes[id]
      walked = node[childKey].reduce(walkNetMapNode, walked)
      walked[id] = walkFn(
        id, node, node[childKey].map(id => walked[id]))
    }
    return walked
  }
  const walked = netMap[rootKey].reduce(walkNetMapNode, {})
  return walkFn(
    netMap.id,
    {
      type: 'root',
      [rootKey]: [],
      [childKey]: netMap[rootKey]
    },
    netMap[rootKey].map(id => walked[id]))
}

const makeNetTransducer = (_netMap) =>
  x => x

const input = (id) =>
  new InputNode(id, [])
const node = (id, value, ...inputs) =>
  new InternalNode(id, value, inputs)
const output = (id, ...inputs) =>
  new OutputNode(id, inputs)
const net = (id, ...inputs) => {
  const netMap = makeNetMap(id, inputs)
  makeNetTransducer(netMap)
  return netMap
}

module.exports = {
  input,
  node,
  output,
  net,
  makeNetMap,
  walkNetMap
}
