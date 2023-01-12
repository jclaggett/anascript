import { makeList } from './lang'
import { read } from './read'
import { applyExp, initialEnv } from './eval'

export { toJS } from './lang'
export { read, parse } from './read'
export { print, printLabel, printSyntax } from './print'

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
