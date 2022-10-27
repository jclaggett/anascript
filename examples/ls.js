const { flatMap } = require('transducist')
const { $, map, net, sink, source, xfnode } = require('.')

const ls = net({
  init: source({ type: 'init' }),

  config: map(({ argv }) => ({
    useTitles: argv.length > 1,
    dirnames: argv
  }),
  $.init),

  dirNet: xfnode(flatMap(({ dirnames, useTitles }) =>
    dirnames.map(dirname =>
      net({
        init: source({ type: 'init' }),
        entry: source({ type: 'dir', path: dirname }),

        title: map(_ => `\n${dirname}:`, $.init),
        name: map(entry => `${dirname}/${entry.name}`, $.entry),

        log: sink({ type: 'log' },
          [$.name, ...(useTitles ? [$.title] : [])])
      })
    )
  ),
  $.config),

  run: sink({ type: 'run' }, $.dirNet)
})

module.exports = { ls }
