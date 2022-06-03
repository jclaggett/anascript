const rep = require('./rep2')

class Env {
  constructor (envMap) {
    this.envMap = envMap
  }

  eval (s) {
    this.envMap = rep.readEval(this.envMap, s)
    return this.envMap
      .get('vals')
  }
}

const makeEnv = (envMap = rep.initialEnv) =>
  new Env(envMap)

module.exports = {
  makeEnv,
  parse: rep.parse,
  read: rep.read,
  print: rep.print,
  printLabel: rep.printLabel,
  toJS: rep.toJS
}
