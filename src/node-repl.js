import repl from 'repl'
import chalk from 'chalk'
import im from 'immutable'
import eval2 from './eval'

const replSession = repl.start({
  prompt: chalk`{green >} `
})

replSession.context.chalk = chalk
replSession.context.im = im
replSession.context.eval = eval2
