// Light weight library with several basic functions.
export const identity = (x) => x

export const first = (x) => x[0]
export const second = (x) => x[1]
export const last = (x) => x[x.length - 1]

export const rest = (x) => x.slice(1)
export const butLast = (x) => x.slice(0, -1)

export const isEmpty = (x) => x.length === 0

export const compose = (...fs) => (x) => fs.reduceRight((x, f) => f(x), x)

export const derive = Object.setPrototypeOf

export const contains = (...xs) => {
  const o = Object.fromEntries(xs.map(x => [x, true]))
  return x => o[x] || false
}
