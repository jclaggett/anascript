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
      // if root level output, replace (empty) outputs with tag(id)
      if (node.outputs.length === 0 && enclosingNode == null) {
        xfs = [[outputer(id)]]
      }

      // flatten xfs
      xfs = xfs.flatMap(identity)

      const xf = getXf(node)

      // if xf is not identity, compose with xfs
      if (xf !== identity) {
        // if xfs has only one xf, compose it directly
        if (xfs.length === 1) {
          xfs = [t.compose(xf, first(xfs))]
        // else if multiple xfs, use multiplex when composing
        } else if (xfs.length > 1) {
          xfs = [t.compose(xf, multiplex(xfs))]
        }
      }

      // if root level input, compose detag(id) with xfs
      if (node.inputs.length === 0 && enclosingNode == null) {
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
      outputer: tag
    }))

const xfnode = (value, inputs) =>
  node({ type: 'xf', value }, inputs)
const source = (value) =>
  node({ type: 'source', value })
const sink = (value, inputs) =>
  node({ type: 'sink', value }, inputs)

const xfmap = (f, inputs) =>
  xfnode(t.map(f), inputs)

module.exports = { integrate, sink, source, xfmap, xfnet, xfnode }
