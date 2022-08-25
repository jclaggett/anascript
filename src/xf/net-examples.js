const {
  tag,
  embed,
  input,
  join,
  node,
  output,
  active,
  passive,
  net,
  $
} = require('./index')

const empty = net({})

const single = net({
  n: input()
})

const double = net({
  n1: input(),
  n2: input()
})

const embedding = net({
  i1: input(),
  e1: embed(double, { n1: $.i1, n2: $.i1 }),
  o1: output($.e1.n1),
  o2: output($.e1.n2)
})

const embedding2 = net({
  i1: input(),
  i2: input(),
  e1: embed(double, { n1: [$.i1, $.i2] }),
  e2: embed(embedding, { i1: [$.e1.n1, $.i1] }),
  o2: output([$.e2.o1, $.e2.o2])
})

const joining = net({
  i1: input(),
  i2: input(),
  j1: join((a, b) => a + b, $.i1, $.i2),
  j2: join((a, b) => a + b, active($.i1), passive($.i2)),
  o1: node(tag('i1&i2-active'), $.j1),
  o2: node(tag('i1-active'), $.j2)
})

module.exports = { empty, single, double, embedding, embedding2, joining }
