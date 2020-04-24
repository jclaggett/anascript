#!/usr/bin/env node
'use strict'

const os = require('os')
const process = require('process')
const readline = require('readline')

const rep = require('./rep')

const main = () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '#user> '
  })

  rl.on('line', (line) => {
    rl.output.write((line === '') ? line : rep(line) + os.EOL)
    rl.prompt()
  }).on('close', () => {
    rl.output.write(os.EOL)
  }).prompt()
}

main()
