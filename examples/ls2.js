const t = require('transducist')
const {
  $, map, net, sink, source, xfnode, prolog, identity, after, passive
} = require('../src/xf')

const takeWhile = (f, inputs) =>
  xfnode(t.takeWhile(f), inputs)

const makeDirNet = ([dirname, ...dirnames], { padding, useTitles }) =>
  net({
    entries: source({ type: 'dir', path: dirname }),
    entryNames: map(x => `${padding}${x.name}`, $.entries),

    entryNames2: xfnode(
      useTitles
        ? prolog(`\n${dirname}:`)
        : identity,
      $.entryNames),

    log: sink({ type: 'log' }, $.entryNames2),

    dirRest: xfnode(after(dirnames), $.entryNames2),
    dirSink: sink({ type: 'pipe', name: 'dirnames' }, $.dirRest)
  })

const ls = net({
  // Act 1: Collect configuration and start processing dirnames
  init: source({ type: 'init' }),

  config: map(({ argv }) => {
    const useTitles = argv.length > 1
    return {
      useTitles,
      padding: ' '.repeat(useTitles ? 4 : 0),
      dirnames: argv
    }
  },
  $.init),

  configDirnames: map(x => x.dirnames, $.config),

  dirSink: sink({ type: 'pipe', name: 'dirnames' }, $.configDirnames),

  // Act 2: process each dirname in sequence (using config as needed)
  dirSource: source({ type: 'pipe', name: 'dirnames' }),

  dirnames: takeWhile(dirnames => dirnames.length > 0, $.dirSource),

  dirNet: map(makeDirNet, $.dirnames, passive($.config)),

  run: sink({ type: 'run' }, $.dirNet)
})

module.exports = { ls }
