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

const makeNetTransducer = (netMap) => {
  let cachedTransducer
  const applyCachedTransducer = (xf) => {
    if (cachedTransducer == null) {
      // TODO actually make the transducer from netMap
      // walkNetMap(netMap, 'inputs', () => null)
      cachedTransducer = x => x
    }
    return cachedTransducer(xf)
  }

  return (...args) =>
    args.length === 0
      ? netMap
      : applyCachedTransducer(...args)
}

const input = () => ({ type: 'input', inputs: [] })
const node = (xf, ...inputs) => ({ type: 'node', xf, inputs })
const output = (...inputs) => ({ type: 'output', inputs })
const embed = (nxf, inputs) => ({ type: 'embed', nxf, inputs })

const sanitizeNetMap = (netMap) =>
  netMap

const pushValue = (obj, key, value) => {
  const values = obj[key] ?? []
  values.push(value)
  return obj
}

const connectNodeDirection = (netMap, a, b, dir) => {
  if (a instanceof Array) {
    pushValue(netMap.nodes[a[0]][dir], a[1], b)
  } else {
    netMap.nodes[a][dir].push(b)
  }
  return netMap
}

const connectNodes = (netMap, a, b) => {
  netMap = connectNodeDirection(netMap, a, b, 'outputs')
  netMap = connectNodeDirection(netMap, b, a, 'inputs')
  return netMap
}

const initNetMapEntry = (node) => ({
  ...node,
  ...(node.type === 'embed'
    ? { inputs: {}, outputs: {} }
    : { inputs: [], outputs: [] })
})

const makeNetMap = (id, netSpec) => {
  const makeNetMapEntry = (netMap, fullId) => {
    const id = fullId instanceof Array ? fullId[0] : fullId

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
          connectNodes(makeNetMapEntry(netMap, fullSubId), fullSubId, fullId),
        netMap),
      netMap)
  }

  const netMap = Object
    .entries(netSpec)
    .filter(entry => entry[1].type === 'output')
    .map(entry => entry[0])
    .reduce(makeNetMapEntry, { id, nodes: {}, inputs: [], outputs: [] })

  return sanitizeNetMap(netMap)
}

const net = (id, netSpec = {}) => {
  const netMap = makeNetMap(id, netSpec)
  return makeNetTransducer(netMap)
}

const simple = net('simple', {
  in: input(),
  n: node(x => x, 'in'),
  out: output('n')
})

const demo = {
  empty: net('emptyNet'),
  simple: net('simpleNet', {
    i1: input(),
    n1: node(x => x, 'i1'),
    n2: node(x => x, 'i1', 'n1'),
    e1: embed(simple, { in: ['i1', 'n2'] }),
    e2: embed(simple, { foo: [['e1', 'out2'], 'n1'] }),
    o1: output('n2', 'i1', ['e2', 'bar'])
  })
}

module.exports = {
  demo,
  input,
  makeNetMap,
  net,
  node,
  output,
  walkNetMap
}
