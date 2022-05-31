const rep = require('./rep2')

class Env {
  constructor (envMap = rep.initialEnv, returnJS = true) {
    this.envMap = envMap
    this.returnJS = returnJS
  }

  formatExp (x) {
    return this.returnJS
      ? rep.toJS(x)
      : x
  }

  parse (s) {
    return rep.parse(s)
  }

  read (s) {
    const exp = rep.read(s)
    return this.formatExp(exp)
  }

  eval (s) {
    this.envMap = rep.readEval(this.envMap, s)
    return this.formatExp(
      this.envMap
        .get('vals')
        .map(x => x.last().last()))
  }
}

module.exports = {
  Env
}
