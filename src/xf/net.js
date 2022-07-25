class GenericNode {
  constructor (name) {
    this.name = name
    this.inputs = []
  }
}

class InputNode extends GenericNode {}

class InternalNode extends GenericNode {
  constructor (name, value, inputs) {
    super(name)
    this.inputs = inputs
    this.value = value
  }
}

class OutputNode extends GenericNode {
  constructor (name, inputs) {
    super(name)
    this.inputs = inputs
  }
}

const makeNetMapEntry = (netMap, node) => {
  const entry = {}
  if (node instanceof InternalNode) entry.value = node.value
  if (!(node instanceof InputNode)) entry.inputs = []
  if (!(node instanceof OutputNode)) entry.outputs = []
  netMap.nodes[node.name] = entry

  if (node instanceof InputNode) netMap.inputs.push(node.name)
  if (node instanceof OutputNode) netMap.outputs.push(node.name)

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

const walkDAG = (node, getParents, processNode) => {
  const walkNode = (visited, node) => {
    if (!visited.has(node)) {
      const parents = getParents(node)
      visited = parents.reduce(walkNode, visited)
      visited = visited.set(node, processNode(node,
        parents.map(parent => visited.get(parent))))
    }
    return visited
  }
  return walkNode(new Map(), node).get(node)
}

module.exports = {
  input,
  node,
  output,
  net,
  makeNetMap,
  walkDAG
}
