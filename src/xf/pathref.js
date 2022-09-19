const pathRefs = new WeakMap()

/*
class PathRef extends Array {
  [util.inspect.custom] (depth, options, _) {
    if (depth < 0) {
      return options.stylize('[$]', 'special')
    }
    return [options.stylize('$'), ...this].join('.')
  }
}
*/

const newPathRef = (path) => {
  return new Proxy(path, {
    get: (_, name) => {
      const newPath = [...path, name]
      const ref = newPathRef(newPath)
      pathRefs.set(ref, newPath)
      return ref
    }
  })
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
