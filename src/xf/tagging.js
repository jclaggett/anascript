const { compose, filter, map, takeWhile } = require('transducist')

const { first, second } = require('./util')
const { transformer, step, result, unreduced } = require('./reducing')

const final = (x) =>
  t => transformer(t, {
    result: (a) => result(t, unreduced(step(t, a, x)))
  })

const tag = (k) =>
  compose(
    map(x => [k, x]),
    final([k]))

const detag = (k) =>
  compose(
    filter(x => x instanceof Array && x.length > 0 && first(x) === k),
    takeWhile(x => x.length === 2),
    map(second))

module.exports = { detag, final, tag }
