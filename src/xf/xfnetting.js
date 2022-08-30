const { compose } = require('transducist')

const { identity, first } = require('./util')
const {
  $, node, makeNetMap, walkNetMap, embedNetMap
} = require('./netting')
const { tag, detag } = require('./tagging')
const { multiplex, demultiplex } = require('./plexing')

const isMultipleInputs = (node, embedNode, id) =>
  (node.inputs.length +
    ((embedNode ?? { inputs: {} })
      .inputs[id] ?? [])
      .length) > 1

const makeTransducer = (netMap) => {
  const xfs = walkNetMap(netMap,
    // eslint-disable-next-line
    (id, node, embedNode, xfs) => {
      // if root level output, replace (empty) outputs with tag(id)
      if (node.outputs.length === 0 && embedNode == null) {
        xfs = [[tag(id)]]
      }

      // flatten xfs
      xfs = xfs.flatMap(identity)

      // if node.value is not identity, compose it with outputs (if any)
      if (node.value !== identity) {
        // if multiple xfs, use multiplex when composing
        if (xfs.length > 1) {
          xfs = [compose(node.value, multiplex(xfs))]
          // if single xf, compose it directly
        } else if (xfs.length === 1) {
          xfs = [compose(node.value, first(xfs))]
        }
      }

      // if root level input, compose detag(id) with xfs
      if (node.inputs.length === 0 && embedNode == null) {
        xfs = xfs.map(xf => compose(detag(id), xf))
        // else if multiple inputs, use demultiplex...
      } else if (isMultipleInputs(node, embedNode, id)) {
        xfs = xfs.map(xf => demultiplex(xf))
      }
      return xfs
    })
  return multiplex(xfs.flatMap(identity))
}

const net = (spec) => {
  const netMap = makeNetMap(spec)
  return (...args) =>
    args.length === 0
      ? netMap
      : makeTransducer(netMap)(args[0])
}

const embed = (xfn, inputs) =>
  embedNetMap(xfn(), inputs)

const output = (inputs) => node(identity, inputs)
const input = () => output([])

module.exports = { embed, input, net, output, $, node }
