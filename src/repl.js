#!/usr/bin/env node
'use strict'

const os = require('os')
const process = require('process')
const path = require('path')
const fs = require('fs')
const fsp = require('fs/promises')
const readline = require('readline')

const chalk = require('chalk')

// const rep = require('./rep')
const rep = require('./rep2')

const loadHistory = async (historyFile) => {
  return (await historyFile.readFile())
    .toString()
    .split('\n')
    .reverse()
}

const saveHistory = async (historyFile, line) => {
  if (historyFile !== undefined) {
    await historyFile.write(`${line}\n`)
  }
}

const main = async () => {
  const historyFileName = path.join(process.cwd(), '.lsn_history')
  const historyFile = fs.existsSync(historyFileName)
    ? await fsp.open(historyFileName, 'r+')
    : undefined

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk`{blue _}{cyan :} `,
    terminal: true,
    historySize: 200,
    history: await loadHistory(historyFile)
  })

  rl.on('line', async (line) => {
    await saveHistory(historyFile, line)
    rl.output.write((line === '')
      ? line
      : rep.rep(line).join(os.EOL) + os.EOL)
    rl.prompt()
  }).on('close', () => {
    rl.output.write(os.EOL)
    historyFile.close()
  }).prompt()
}

main()
