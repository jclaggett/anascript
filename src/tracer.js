'use strict'

const trace = Symbol('trace')

function tracer (prev = { name: 'root' }) {
  const call = (...args) =>
    tracer(prev.args ? { prev, args } : { ...prev, args })

  const get = (_, name) =>
    name === trace ? prev : tracer({ prev, name })

  return new Proxy(call, { get })
}

function getTrace (tracer) {
  return tracer[trace]
}

function exampleUse () {
  const foo = a => a.loop(42).bar.zippy('hello')
  return getTrace(foo(tracer()))
}

module.exports = {
  exampleUse,
  getTrace,
  tracer
}
