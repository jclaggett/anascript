const { makeList, toJS } = require('./lang')
const { read, parse } = require('./read')
const { applyExp, initialEnv } = require('./eval')
const { print, printLabel, printSyntax } = require('./print')

class Env {
  constructor (envMap) {
    this.envMap = envMap
  }

  eval (s) {
    this.envMap = read(s)
      .reduce(applyExp,
        this.envMap.set('vals', makeList()))
    return this.envMap
      .get('vals')
  }
}

const makeEnv = (envMap = initialEnv) =>
  new Env(envMap)

module.exports = {
  makeEnv,
  parse,
  read,
  print,
  printLabel,
  printSyntax,
  toJS
}
