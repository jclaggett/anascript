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
const init = (t) => t['@@transducer/init']()
const step = (t, a, v) => t['@@transducer/step'](a, v)
const result = (t, a) => t['@@transducer/result'](a)

const transformer = (t, obj) => ({
  '@@transducer/init': obj.init ?? (() => init(t)),
  '@@transducer/step': obj.step ?? ((a, v) => step(t, a, v)),
  '@@transducer/result': obj.result ?? ((a) => result(t, a))
})

module.exports = {
  isReduced,
  unreduced,
  reduced,

  transformer,
  init,
  step,
  result
}
