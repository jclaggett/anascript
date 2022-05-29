#!/usr/bin/env node
'use strict'

const os = require('os')
const process = require('process')
const path = require('path')
const fs = require('fs')
const fsp = require('fs/promises')
const readline = require('readline')

const chalk = require('chalk')
const { marked } = require('marked')
const TerminalRenderer = require('marked-terminal')

const { version } = require('../package')

// const rep = require('./rep')
const rep = require('./rep2')

const helpText = `
# Anascript Help
This is **markdown** printed in the \`terminal\`
`

const buildHelp = () => {
  marked.setOptions({
    renderer: new TerminalRenderer()
  })
  const indent = ' ┊  '
  rep.setCurrentEnv(
    rep.sym('help'),
    () => console.log(
      indent + marked(helpText).replace(/\n/g, '\n' + indent)))
}

const openHistory = async () => {
  const historyFileName = path.join(process.cwd(), '.ana_history')
  const historyFile = fs.existsSync(historyFileName)
    ? await fsp.open(historyFileName, 'r+')
    : undefined
  return historyFile
}

const loadHistory = async historyFile =>
  historyFile !== undefined
    ? (await historyFile.readFile())
        .toString()
        .split('\n')
        .reverse()
    : []

const saveHistory = async (historyFile, line) => {
  if (historyFile !== undefined) {
    await historyFile.write(`${line}\n`)
  }
}

const closeHistory = async historyFile =>
  historyFile !== undefined
    ? historyFile.close()
    : null

const printPrompt = x =>
  chalk`{blue ${x}}{cyan :} `

const main = async () => {
  console.log(`Welcome to Anascript! (v${version})`)
  buildHelp()

  const historyFile = await openHistory()

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: printPrompt(1),
    terminal: true,
    historySize: 200,
    history: await loadHistory(historyFile)
  })

  rl.on('line', async (line) => {
    await saveHistory(historyFile, line)
    rl.output.write((line === '')
      ? line
      : rep.rep(line).join(os.EOL) + os.EOL)
    rl.setPrompt(printPrompt(rep.getCurrentEnv('expTotal')))
    rl.prompt()
  }).on('close', () => {
    rl.output.write(os.EOL)
    closeHistory(historyFile)
  }).prompt()
}

main()
