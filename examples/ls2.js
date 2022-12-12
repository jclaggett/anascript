const {
  $, chain, graph, takeWhile, mapjoin, map, sink, source, prolog, identity,
  after, run
} = require('../src/xf')

const makeDirNet = ([dirname, ...dirnames], { padding, useTitles }) => {
  return graph({
    entries: source('dir', { path: dirname }),
    entryNames: chain([
      map(x => `${padding}${x.name}`),
      useTitles ? prolog(`\n${dirname}`) : identity
    ]),

    log: sink('log'),

    dirRest: after(dirnames),
    dirSink: sink('pipe', 'dirnames'),
    debug: sink('debug')
  }, [
    [$.entries, $.entryNames],
    [$.entryNames, $.log],
    [$.entryNames, $.dirRest],
    [$.dirRest, $.dirSink]
  ])
}

const ls = graph({
  // Act 1: Collect configuration and start processing dirnames
  init: source('init'),

  config: map(({ argv }) => {
    const useTitles = argv.length > 1
    return {
      useTitles,
      padding: ' '.repeat(useTitles ? 4 : 0),
      dirnames: argv
    }
  }),

  configDirnames: map(x => x.dirnames),

  dirSink: sink('pipe', 'dirnames'),

  // Act 2: process each dirname in sequence (using config as needed)
  dirSource: source('pipe', 'dirnames'),

  dirnames: takeWhile(dirnames => dirnames.length > 0),

  dirNet: mapjoin(makeDirNet, [true, false]),

  run: sink('run'),
  debug: sink('debug')
}, [
  [$.config, $.debug],
  [$.init, $.config],
  [$.config, $.configDirnames],
  [$.configDirnames, $.dirSink],
  [$.dirSource, $.dirnames],
  [$.dirnames, $.dirNet[0]],
  [$.config, $.dirNet[1]],
  [$.dirNet, $.run]
])

module.exports = { run, ls }
