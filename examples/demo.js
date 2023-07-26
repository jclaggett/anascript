import * as xf from '../src/xf/index.js'
import { $ } from '../src/xf/index.js'

const g1 = xf.graph({
  init: xf.source('init'),
  t200: xf.source('timer', 300),
  t500: xf.source('timer', 800),

  whee: xf.emit('whee!'),
  whoo: xf.map(x => -x),

  take10: xf.take(10),
  debug: xf.sink('debug')
}, [
  [$.t200, $.whee],
  [$.whee, $.take10],
  [$.t500, $.whoo],
  [$.whoo, $.take10],
  [$.take10, $.debug]
])

const run = xf.makeRun({ a: 1 }, xf.sources, xf.sinks)

export default async () => await run(g1)
