const t = require('transducist')

const { identity, first } = require('./util')
const { walk, node } = require('./netting')
const { tag, detag } = require('./tagging')
const { multiplex, demultiplex } = require('./plexing')

const isMultipleInputs = (node, enclosingNode, id) =>
  (node.inputs.length +
    ((enclosingNode ?? { inputs: {} })
      .inputs[id] ?? [])
      .length) > 1

const getXf = (node) =>
  node.value?.type === 'xf'
    ? node.value.value
    : identity

const integrate = (netMap, { inputer, outputer }) =>
  walk(netMap,
    // eslint-disable-next-line
    (id, node, enclosingNode, xfs) => {
      const inputNode = (node.inputs.length === 0 && enclosingNode == null)
      const outputNode = (node.outputs.length === 0 && enclosingNode == null)
      const xf = getXf(node)

      // if root level output, replace (empty) xfs
      if (outputNode) {
        xfs = outputer(id, node.value)
      } else {
        // flatten xfs
        xfs = xfs.flatMap(identity)
      }

      // if single xfs and xf is not identity compose directly
      if (xfs.length === 1 && xf !== identity) {
        xfs = [t.compose(xf, first(xfs))]
        // if multiple xfs and xf is not identity compose directly
      } else if (xfs.length > 1 && (xf !== identity || inputNode)) {
        xfs = [t.compose(xf, multiplex(xfs))]
      }

      // if inputNode pass to inputer
      if (inputNode) {
        xfs = xfs.map(xf => inputer(id, node.value, xf))
        // else if multiple inputs, use demultiplex...
      } else if (isMultipleInputs(node, enclosingNode, id)) {
        xfs = xfs.map(xf => demultiplex(xf))
      }
      return xfs
    })
    .flatMap(identity)

const xfnet = (netMap) =>
  multiplex(
    integrate(netMap, {
      inputer: (id, _, xf) => t.compose(detag(id), xf),
      outputer: (id) => [tag(id)]
    }))

const xfnode = (value, inputs) =>
  node({ type: 'xf', value }, inputs)
const source = (value) =>
  node({ type: 'source', value })
const sink = (value, inputs) =>
  node({ type: 'sink', value }, inputs)

// this map is used within joining map for the trivial case
const simpleMap = (f, inputs) =>
  xfnode(t.map(f), inputs)

const take = (n, inputs) =>
  xfnode(t.take(n), inputs)

module.exports = { integrate, sink, source, simpleMap, take, xfnet, xfnode }
