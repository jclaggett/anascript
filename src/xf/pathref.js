
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
  const ref = new Proxy({}, {
    get: (subpaths, name) => {
      if (!(name in subpaths)) {
        subpaths[name] = newPathRef([...path, name])
      }
      return subpaths[name]
    }
  })
  pathRefs.set(ref, path)
  return ref
}

const $ = newPathRef([])

const isPathRef = (x) =>
  pathRefs.has(x)

const derefPathRef = (x) =>
  pathRefs.get(x)

const pathRefToArray = (x) =>
  isPathRef(x)
    ? derefPathRef(x)
    : x

const pathRefToString = (x) =>
  isPathRef(x)
    ? ['$']
        .concat(derefPathRef(x))
        .join('.')
    : x

const arrayToPathRef = ([name, ...path], pathRef = $) =>
  (name == null)
    ? pathRef
    : arrayToPathRef(path, pathRef[name])

module.exports = {
  $,
  isPathRef,
  derefPathRef,
  pathRefToArray,
  pathRefToString,
  arrayToPathRef
}
