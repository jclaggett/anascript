import { performance } from 'node:perf_hooks'

import {
  emitAstExpr,
  makeEnv,
  read,
  toJS
} from '../src/index.js'
import * as lang from '../src/lang.js'

const workloads = [
  {
    name: 'label chaining',
    src: 'a:b:2 [a b]'
  },
  {
    name: 'list destructuring',
    src: '[x ...xs]:[1 2 3 4 5] [x xs]'
  },
  {
    name: 'fn args + spread',
    src: '((fn [x ...xs] [x xs]) 1 2 3)'
  },
  {
    name: 'control + collections',
    src: '(if true [1 2 3] {1 2})'
  },
  {
    name: 'fixed-point factorial',
    warmupIters: 20,
    measureIters: 100,
    src: `
      z:(fn [f] ((fn [x] (f (fn [v] ((x x) v)))) (fn [x] (f (fn [v] ((x x) v))))))
      factGen:(fn [recur] (fn [n] (if (= n 0) 1 (* n (recur (- n 1))))))
      fact:(z factGen)
      (fact 8)
    `
  }
]

const warmupIters = 300
const measureIters = 3000

const runEval = (src) =>
  makeEnv().eval(src)?.last()?.last()?.last()

const compileEmitted = (src) =>
  read(src)
    .map((exp) => Function('lang', 'env', `
      const val = ${emitAstExpr(exp, 'env')}
      return { env, val }
    `))
    .toArray()

const runEmitCompiled = (fns) => {
  let env = makeEnv().envMap
  let val
  for (const fn of fns) {
    const out = fn(lang, env)
    env = out.env
    val = out.val
  }
  return val
}

const measureMs = (fn, n) => {
  const t0 = performance.now()
  for (let i = 0; i < n; i += 1) fn()
  return performance.now() - t0
}

const fmt = (n) => n.toFixed(2).padStart(8)

console.log(`\nBenchmark: eval.js vs emitted runtime`)
console.log(`Warmup iterations: ${warmupIters}`)
console.log(`Measured iterations: ${measureIters}\n`)
console.log('Workload'.padEnd(28) + 'eval(ms)  emit(ms)  speedup')
console.log('-'.repeat(58))

for (const { name, src, warmupIters: warmupN, measureIters: measureN } of workloads) {
  const compiled = compileEmitted(src)

  const evalVal = runEval(src)
  const emitVal = runEmitCompiled(compiled)
  const evalJs = toJS(evalVal)
  const emitJs = toJS(emitVal)
  if (JSON.stringify(evalJs) !== JSON.stringify(emitJs)) {
    throw new Error(`parity mismatch in workload "${name}"`)
  }

  measureMs(() => runEval(src), warmupN ?? warmupIters)
  measureMs(() => runEmitCompiled(compiled), warmupN ?? warmupIters)

  const evalMs = measureMs(() => runEval(src), measureN ?? measureIters)
  const emitMs = measureMs(() => runEmitCompiled(compiled), measureN ?? measureIters)
  const speedup = evalMs / emitMs

  console.log(
    name.padEnd(28) +
    `${fmt(evalMs)} ${fmt(emitMs)}  ${speedup.toFixed(2)}x`
  )
}

console.log('')
