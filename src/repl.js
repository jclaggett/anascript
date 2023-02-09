#!/usr/bin/env node

import os from 'os'
import process from 'process'
import path from 'path'
import fs from 'fs'
import fsp from 'fs/promises'
import readline from 'readline'

import chalk from 'chalk'
import { marked } from 'marked'
import TerminalRenderer from 'marked-terminal'

import * as lang from './lang.js'
import * as eval2 from './eval.js'
import * as ana from './index.js'

const { version } = JSON.parse(fs.readFileSync(process.env.PWD + '/package.json'))

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
    lang.sym('help'),
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

  const env = ana.makeEnv(buildHelp(eval2.initialEnv))

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
