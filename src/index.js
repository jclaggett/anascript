import { makeList } from './lang.js'
import { read } from './read.js'
import { applyExp, initialEnv } from './eval.js'

export { sym, toJS } from './lang.js'
export { read, parse, transform, emitLisp, emitTree } from './read.js'
export { print, printLabel, printSyntax } from './print.js'

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

export const makeEnv = (envMap = initialEnv) =>
  new Env(envMap)
