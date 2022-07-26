class GenericNode {
  constructor (name) {
    this.name = name
    this.inputs = []
  }
}

class InputNode extends GenericNode {
  constructor (name) {
    super(name)
    this.type = 'input'
  }
}

class InternalNode extends GenericNode {
  constructor (name, value, inputs) {
    super(name)
    this.type = 'node'
    this.inputs = inputs
    this.value = value
  }
}

class OutputNode extends GenericNode {
  constructor (name, inputs) {
    super(name)
    this.type = 'output'
    this.inputs = inputs
  }
}

const makeNetMapEntry = (netMap, node) => {
  netMap.nodes[node.name] = {
    type: node.type,
    value: node.value,
    inputs: [],
    outputs: []
  }

  if (node.type === 'input') netMap.inputs.push(node.name)
  if (node.type === 'output') netMap.outputs.push(node.name)

  return node.inputs.reduce(
    (netMap, subnode) => {
      if (netMap.nodes[subnode.name] == null) {
        netMap = makeNetMapEntry(netMap, subnode)
      }

      netMap.nodes[subnode.name].outputs.push(node.name)
      netMap.nodes[node.name].inputs.push(subnode.name)
      return netMap
    },
    netMap)
}

const makeNetMap = (name, inputs) => {
  const netMap = {
    name,
    inputs: [],
    nodes: {},
    outputs: []
  }
  return inputs.reduce(makeNetMapEntry, netMap)
}

const walkNetMap = (netMap, rootKey, visitFn) => {
  const childKey = rootKey === 'outputs' ? 'inputs' : 'outputs'

  const walkNetMapNode = (visited, name) => {
    if (visited[name] == null) {
      const node = netMap.nodes[name]
      visited = node[childKey].reduce(walkNetMapNode, visited)
      visited[name] = visitFn(
        name,
        node,
        node[childKey].map(name => visited[name]))
    }
    return visited
  }
  const visited = netMap[rootKey].reduce(walkNetMapNode, {})
  return netMap[rootKey].map(name => visited[name])
}

const makeNetTransducer = (_netMap) =>
  x => x

const input = (name) =>
  new InputNode(name, [])
const node = (name, value, ...inputs) =>
  new InternalNode(name, value, inputs)
const output = (name, ...inputs) =>
  new OutputNode(name, inputs)
const net = (name, ...inputs) => {
  const netMap = makeNetMap(name, inputs)
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
