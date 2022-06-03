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
const ana = require('./index')

const helpText = `
# Anascript Help
This is **markdown** printed in the \`terminal\`
`

const buildHelp = env => {
  marked.setOptions({
    renderer: new TerminalRenderer()
  })
  const indent = ' ┊  '
  return env.set(
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

const repl = async () => {
  console.log(`Welcome to Anascript! (v${version})`)
  const historyFile = await openHistory()

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: printPrompt(1),
    terminal: true,
    historySize: 200,
    history: await loadHistory(historyFile)
  })

  const env = ana.makeEnv(buildHelp(rep.initialEnv))

  rl.on('line', async (line) => {
    await saveHistory(historyFile, line)
    try {
      rl.output.write((line === '')
        ? line
        : env
          .eval(line)
          .map(x => ana.printLabel(x.get(2)))
          .join(os.EOL) + os.EOL)
      rl.setPrompt(printPrompt(env.envMap.get('expTotal')))
    } catch (e) {
      console.dir(e)
    }
    rl.prompt()
  }).on('close', () => {
    rl.output.write(os.EOL)
    closeHistory(historyFile)
  }).prompt()
}

const evalFile = filename =>
  console.log(
    ana.print(
      ana
        .makeEnv()
        .eval(`(do ${fs.readFileSync(filename)})`)
        .last()
        .last()))

const main = async () => {
  // parse command line args here
  const files = process.argv.slice(2)
  if (files.length === 0) {
    return repl()
  } else {
    return files.map(evalFile)
  }
}

main()
