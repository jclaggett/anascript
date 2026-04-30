import * as lang from './lang.js'
import { makeEnv, initialEnv } from './env.js'

/**
 * Run Anascript source through read → transform → emit/run (via {@link makeEnv}).
 * Does not load the Node terminal REPL (`repl.js`); intended for browsers and embedders.
 */
export const runProgram = (source, options = {}) => {
  const {
    envMap = initialEnv,
    runtime,
    paritySample
  } = options
  const env = makeEnv(envMap, { runtime, paritySample })
  const vals = env.eval(source)
  const binds = vals?.last()
  const lastValue = binds
    ?.rest()
    ?.find(b => lang.is(b.get(1), lang.sym('_')))
    ?.get(2)
  return { env, vals, lastValue }
}
