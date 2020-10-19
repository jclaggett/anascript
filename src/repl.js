#!/usr/bin/env node
'use strict'

const os = require('os')
const process = require('process')
const readline = require('readline')

const chalk = require('chalk')

const rep = require('./rep')

const main = () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk`{blue _}{cyan :} `,
    terminal: true,
    historySize: 200
  })

  rl.on('line', (line) => {
    rl.output.write((line === '') ? line : rep.rep(line) + os.EOL)
    rl.prompt()
  }).on('close', () => {
    rl.output.write(os.EOL)
  }).prompt()
}

main()
