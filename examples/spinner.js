import * as t from 'transducist'
import { graph, source, sink, $, dedupe } from '../src/xf/index.js'
export { run } from '../src/xf/index.js'

// Define a spinner net
const spinnerString =
  [
    '⠋',
    '⠙',
    '⠹',
    '⠸',
    '⠼',
    '⠴',
    '⠦',
    '⠧',
    '⠇',
    '⠏'
  ]

export const spinner = graph(
  {
    // freq is 30hz
    time: source('time', { freq: 1000 / 60 }),

    limitedTime: t.take(600),

    spinnerIndex: t.compose(
      t.map(ts =>
        // each loop of the spinner is on screen for 2000 ms
        Math.floor(ts / (2000 / spinnerString.length)) % spinnerString.length),
      dedupe()
    ),

    spinner: t.map(i => spinnerString[i]),

    streamFn: t.map(str =>
      process => {
        process.stdout.cursorTo(40)
        process.stdout.write(' ' + str)
        process.stdout.moveCursor(-2, 0)
      }),

    // TODO: figure out how to 'talk' to the process.stdout sink. I need to
    // give it commands over time.
    stdout: sink('process'),
    log: sink('log')
  },

  [
    [$.time, $.limitedTime],
    [$.limitedTime, $.spinnerIndex],
    [$.spinnerIndex, $.spinner],
    // [$.spinnerIndex, $.log],
    [$.spinner, $.streamFn],
    [$.streamFn, $.stdout]
  ])
