import {
  $, flatMap, map, net, sink, source, xfnode
} from '../src/xf'

const makeDirNets = ({ dirnames, padding, useTitles }) =>
  dirnames.map(dirname =>
    net({
      init: source({ type: 'init' }),
      entry: source({ type: 'dir', path: dirname }),

      title: map(_ => `\n${dirname}:`, $.init),
      name: map(x => `${padding}${x.name}`, $.entry),

      log: sink({ type: 'log' },
        [$.name, ...(useTitles ? [$.title] : [])])
    })
  )

const ls = net({
  init: source({ type: 'init' }),

  config: map(({ argv }) => {
    const useTitles = argv.length > 1
    return {
      useTitles,
      padding: ' '.repeat(useTitles ? 4 : 0),
      dirnames: argv
    }
  }, $.init),

  dirNets: xfnode(flatMap(makeDirNets), $.config),

  run: sink({ type: 'run' }, $.dirNets)
})

module.exports = { ls }
