const lang = require('./lang')
const read = require('./read')
const eval2 = require('./eval')
const print = require('./print')

class Env {
  constructor (envMap) {
    this.envMap = envMap
  }

  eval (s) {
    this.envMap = read.read(s)
      .reduce(
        eval2.applyExp,
        this.envMap.set('vals', lang.makeList()))
    return this.envMap
      .get('vals')
  }
}

const makeEnv = (envMap = eval2.initialEnv) =>
  new Env(envMap)

module.exports = {
  makeEnv,
  parse: read.parse,
  read: read.read,
  print: print.print,
  printLabel: print.printLabel,
  toJS: lang.toJS
}
