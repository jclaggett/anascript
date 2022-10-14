const {
  $,
  active,
  embed,
  map,
  net,
  passive,
  sink,
  source
} = require('.')

const empty = net({})

const single = net({
  n: map(x => x + 1)
})

const double = net({
  n1: source({ type: 'init' }),
  n2: source({ type: 'time', freq: 1000 })
})

const embedding = net({
  i1: source({ type: 'init' }),

  e1: embed(double, { n1: $.i1, n2: $.i1 }),

  o1: sink({ type: 'log' }, $.e1.n1),
  o2: sink({ type: 'log' }, $.e1.n2)
})

const embedding2 = net({
  i1: source({ type: 'init' }),
  i2: source({ type: 'time', freq: 1000 }),

  e1: embed(double, { n1: [$.i1, $.i2] }),
  e2: embed(embedding, { i1: [$.e1.n1, $.i1] }),

  o2: sink({ type: 'log' }, [$.e2.o1, $.e2.o2])
})

const joining = net({
  i1: source({ type: 'init' }),
  i2: source({ type: 'time', freq: 1000 }),

  j1: map((a, b) => a + b, $.i1, $.i2),
  j2: map((a, b) => a + b, active($.i1), passive($.i2)),

  o1: sink({ type: 'log' }, $.j1),
  o2: sink({ type: 'debug' }, $.j2)
})

module.exports = { empty, single, double, embedding, embedding2, joining }
