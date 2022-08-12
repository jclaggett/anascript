'use strict'

const {
  compose,
  filter,
  map,
  takeWhile
} = require('transducist')

const net = require('./net')

// Reduced protocol
const isReduced = x =>
  x instanceof Object && x['@@transducer/reduced'] === true

const unreduced = x =>
  isReduced(x)
    ? x['@@transducer/value']
    : x

const reduced = x =>
  isReduced(x)
    ? x
    : { '@@transducer/reduced': true, '@@transducer/value': x }

// Transformer protocol
const transformer = (obj) => ({
  '@@transducer/init': obj.init,
  '@@transducer/step': obj.step,
  '@@transducer/result': obj.result
})

const init = (t) => t['@@transducer/init']()
const step = (t, a, v) => t['@@transducer/step'](a, v)
const result = (t, a) => t['@@transducer/result'](a)

// Transducer functions
const final = x =>
  t => transformer({
    init: () => init(t),
    step: (a, v) => step(t, a, v),
    result: (a) => result(t, unreduced(step(t, a, x)))
  })

const multiplex = (xfs) =>
  t => {
    let ts = xfs.map(xf => xf(t))
    return transformer({
      init: () => init(t),
      step: (a, v) => {
        const a3 = ts.reduce(
          (a, t, i) => {
            const a2 = step(t, a, v)
            if (isReduced(a2)) {
              ts[i] = null // Remove t from ts
              return result(t, unreduced(a2))
            } else {
              return a2
            }
          },
          a)
        ts = ts.filter(x => x != null)
        if (ts.length === 0) {
          return reduced(a3)
        } else {
          return unreduced(a3)
        }
      },
      result: (a) => ts.reduce((a, t) => result(t, a), a)
    })
  }

const demultiplexTransformer = (state, t) =>
  // Warning: state is mutated by the transformer created in this function
  transformer({
    init: () => {
      state.running = true
      if (state.init == null) {
        state.init = init(t)
      }
      return state.init
    },
    step: (a, v) => {
      state.running = true
      if (state.reduced == null) {
        const a2 = step(t, a, v)
        if (isReduced(a2)) {
          state.reduced = a2
        }
        return a2
      } else {
        return state.reduced
      }
    },
    result: (a) => {
      state.running = true
      if (state.result == null) {
        state.refCount -= 1
        if (state.refCount <= 0 || state.reduced != null) {
          state.result = result(t, a)
          return state.result
        } else {
          return a
        }
      } else {
        return state.result
      }
    }
  })

const demultiplex = (xf) => {
  // Shared, mutable state across multiple calls to the transducer.
  // This makes this function not thread safe.
  let state = { running: true }
  return t => {
    if (state.running) {
      state = { running: false, refCount: 0 }
    }
    state.refCount += 1
    if (state.transformer == null) {
      state.transformer = demultiplexTransformer(state, xf(t))
    }
    return state.transformer
  }
}

const tag = (k) =>
  compose(
    map(x => [k, x]),
    final([k]))

const detag = (k) =>
  compose(
    filter(x => x instanceof Array && x.length > 0 && x[0] === k),
    takeWhile(x => x.length === 2),
    map(x => x[1]))

// xfnet section
const initXfNet = (netMap) =>
  multiplex(
    net.walk(netMap,
      'inputs',
      (id, path, node, outputs) => {
        const outputXfs = outputs.flatMap(x => x)
        const outputXfs2 = outputXfs.length === 0 ? [x => x] : outputXfs
        const multiplex2 = outputXfs2.length === 1 ? x => x[0] : multiplex
        const demultiplex2 = node.inputs.length === 1 ? x => x : demultiplex

        return node.type === 'output'
          ? path.length === 0
            ? [demultiplex2(tag(id))]
            : outputXfs2
          : node.type === 'input'
            ? path.length === 0
              ? compose(detag(id), multiplex2(outputXfs2))
              : outputXfs2
            : [demultiplex2(compose(node.value, multiplex2(outputXfs2)))]
      }))

const xfnet = (spec) => {
  const netMap = net.net(spec)
  return (...args) =>
    args.length === 0
      ? netMap
      : initXfNet(netMap)(args[0])
}

const embed = (xfn, inputs) =>
  net.embed(xfn(), inputs)

// xfnet join section

class Passive { constructor (x) { this.x = x } }
const isPassive = (x) => x instanceof Passive
const passive = (x) => isPassive(x) ? x : new Passive(x)
const isActive = (x) => !isPassive(x)
const active = (x) => isActive(x) ? x : x.x

const joinIntake = (sharedState, inputIndex, isActive) =>
  (t) => {
    let stepFirstCall = true
    return transformer({
      init: () => init(t),
      step: (a, v) => {
        if (stepFirstCall) {
          sharedState.neededInputs -= 1
          stepFirstCall = false
        }
        sharedState.inputIndex = inputIndex
        sharedState.isActive = isActive
        return step(t, a, v)
      },
      result: (a) => result(t, a)
    })
  }

const joinCollector = (sharedState, inputs) =>
  (t) => {
    sharedState.neededInputs = inputs.length
    const currentOutput = new Array(inputs.length)
    return transformer({
      init: () => init(t),
      step: (a, v) => {
        currentOutput[sharedState.inputIndex] = v
        return (sharedState.neededInputs < 1 && sharedState.isActive)
          ? step(t, a, [...currentOutput]) // shallow copy output to be safe
          : a
      },
      result: (a) => result(t, a)
    })
  }

const label = (s, n) => s + n.toString()

const join = (...inputs) => {
  // this state is mutated by all joinIntake and joinCollector transducers.
  const sharedState = {}

  return embed(
    xfnet({
      ...Object.fromEntries(inputs.map((_, i) =>
        [label('i', i), net.input()])),
      ...Object.fromEntries(inputs.map((x, i) =>
        [label('n', i), net.node(joinIntake(sharedState, i, isActive(x)), [label('i', i)])])),
      collector: net.node(joinCollector(sharedState, inputs), inputs.map((_, i) =>
        label('n', i))),
      out: net.output(['collector'])
    }),
    Object.fromEntries(inputs.map(active).map((input, i) =>
      [label('i', i), input])))
}

module.exports = {
  isReduced,
  reduced,
  unreduced,

  final,
  multiplex,
  demultiplex,
  tag,
  detag,
  xfnet,
  embed,
  input: net.input,
  output: net.output,
  node: net.node,

  join,
  active,
  isActive,
  passive,
  isPassive
}
