const { embed, input, xfnet, node, output } = require('./transducers')

const empty = xfnet()

const io = xfnet({
  i: input(),
  o: output(['i'])
})

const i2o2 = xfnet({
  i1: input(),
  o1: output(['i1']),
  i2: input(),
  o2: output(['i2'])
})

const ino = xfnet({
  in: input(),
  node: node(x => x, ['in']),
  out: output(['node'])
})

const ieo = xfnet({
  i1: input(),
  e1: embed(ino, { in: ['i1'] }),
  o1: output([['e1', 'out']])
})

const complex = xfnet({
  i1: input(),
  i2: input(),
  n1: node(x => x, ['i1']),
  n2: node(x => x, ['i2', 'n1']),
  e1: embed(ino, { in: ['i1', 'n2'] }),
  e2: embed(ino, { in: [['e1', 'out'], 'n1'] }),
  o1: output(['n2']),
  o2: output([['e2', 'out']])
})

module.exports = {
  empty,
  io,
  i2o2,
  ino,
  ieo,
  complex
}
