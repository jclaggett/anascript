const { embed, input, net, node, output } = require('./net')

const empty = net('emptyNet')

const simple = net('simpleNet', {
  in: input(),
  n: node(x => x, 'in'),
  out: output('n')
})

const simpleEmbed = net('embedNet', {
  i1: input(),
  e1: embed(simple, { in: ['i1'] }),
  o1: output(['e1', 'out'])
})

const complex = net('complexNet', {
  i1: input(),
  n1: node(x => x, 'i1'),
  n2: node(x => x, 'i1', 'n1'),
  e1: embed(simple, { in: ['i1', 'n2'] }),
  e2: embed(simple, { in: [['e1', 'out'], 'n1'] }),
  o1: output('n2', 'i1', ['e2', 'out'])
})

module.exports = {
  empty,
  simple,
  simpleEmbed,
  complex
}
