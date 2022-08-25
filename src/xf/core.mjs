// Light weight library with several basic functions.

export const identity = x => x
export const first = x => x[0]
export const second = x => x[1]
export const last = x => x[x.length - 1]
export const butLast = x => x.slice(0, -1)
