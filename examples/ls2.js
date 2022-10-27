const { $, map, net, sink, source, xfnode, prolog, identity, after } = require('../src/xf')

const ls = net({
  // Act 1: Collect configuration and start processing dirnames
  init: source({ type: 'init' }),

  config: map(({ argv }) => ({
    useTitles: argv.length > 1,
    dirnames: argv
  }),
  $.init),
  configDirnames: map(x => x.dirnames, $.config),

  dirSink: sink({ type: 'pipe', name: 'dirnames' }, $.configDirnames),

  // Act 2: process each dirname in sequence (using config as needed)
  dirSource: source({ type: 'pipe', name: 'dirnames' }),

  dirNet: map(([dirname, ...dirnames], { useTitles }) =>
    (dirname == null)
      ? net({})
      : net({
        entries: source({ type: 'dir', path: dirname }),
        entryNames: map(x => x.name, $.entries),

        entryNames2: xfnode(
          useTitles
            ? prolog(`\n${dirname}:`)
            : identity,
          $.entryNames),

        log: sink({ type: 'log' }, $.entryNames2),

        dirRest: xfnode(after(dirnames), $.entryNames2),
        dirSink: sink({ type: 'pipe', name: 'dirnames' }, $.dirRest)
      }),
  $.dirSource, $.config),

  run: sink({ type: 'run' }, $.dirNet)
  // debug: sink({ type: 'debug' }, $.configDirnames)
})

module.exports = { ls }
