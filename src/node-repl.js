'use strict'

const repl = require('repl')
const chalk = require('chalk')

const replSession = repl.start({
  prompt: chalk`{green >} `
})

replSession.context.chalk = chalk
replSession.context.im = require('immutable')
replSession.context.eval = require('./eval')
