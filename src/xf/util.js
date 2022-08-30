// Light weight library with several basic functions.
module.exports = {
  identity: x => x,
  first: x => x[0],
  second: x => x[1],
  last: x => x[x.length - 1],
  butLast: x => x.slice(0, -1)
}