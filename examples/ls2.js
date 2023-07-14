import * as xf from '../src/xf/index.js'
import {
  $, chain, graph, takeWhile, mapjoin, map, sink, source, prolog, identity,
  after
} from '../src/xf/index.js'

export const run = xf.makeRun({}, xf.sources, xf.sinks)

const makeDirNet = ([dirname, ...dirnames], { padding, useTitles }) => {
  const entryNames = chain(
    map(x => `${padding}${x.name}`),
    useTitles ? prolog(`\n${dirname}`) : identity
  )

  return graph({
    entries: source('dir', dirname),
    entryNames,

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

export const ls = graph({
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
  // [$.config, $.debug],
  [$.init, $.config],
  [$.config, $.configDirnames],
  [$.configDirnames, $.dirSink],
  [$.dirSource, $.dirnames],
  [$.dirnames, $.dirNet[0]],
  [$.config, $.dirNet[1]],
  [$.dirNet, $.run]
])

export const runls = async (...argv) => {
  xf.pg(ls)
  await run(ls, ...argv)
}
