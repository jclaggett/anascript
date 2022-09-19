
/* TODO create a custom inspector method on the Proxy object so that debug
   messages with pathRefs are more readable. challenge: derive a customized
   Proxy class.

const util = require('util')
class MyProxy {
  constructor (value, handler) {
    Object.setPrototypeOf(
      Object.getPrototypeOf(this),
      new Proxy(value, handler))
  }

  [util.inspect.custom] (depth, options, _) {
    if (depth < 0) {
      return options.stylize('[$]', 'special')
    }
    return [options.stylize('$', 'special'), ...this].join('.')
  }
}

*/

// All pathRefs defined will be stored in the following WeakMap.
const pathRefs = new WeakMap()

const newPathRef = (path) => {
  const ref = new Proxy(path, {
    get: (path, name) =>
      newPathRef([...path, name])
  })
  pathRefs.set(ref, path)
  return ref
}

const isPathRef = (x) =>
  pathRefs.has(x)

const derefPathRef = (x) =>
  pathRefs.get(x)

const $ = newPathRef([])

const normalizeRefs = (x) =>
  isPathRef(x)
    ? [derefPathRef(x)]
    : Array.isArray(x)
      ? x.flatMap(normalizeRefs)
      : []

module.exports = { $, normalizeRefs }
