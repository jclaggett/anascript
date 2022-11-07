const { reduced, transducer, STEP, RESULT } = require('./reducing')
const { $, embed, net } = require('./netting')
const { simpleMap, xfnode } = require('./xfnetting')

class Passive { constructor (x) { this.x = x } }
const isPassive = (x) => x instanceof Passive
const passive = (x) => isPassive(x) ? x : new Passive(x)
const isActive = (x) => !isPassive(x)
const active = (x) => isActive(x) ? x : x.x

const joinIntake = (sharedState, index, active) =>
  transducer(r => {
    let stepNeverCalled = true
    return {
      [STEP]: (a, v) => {
        if (stepNeverCalled) {
          stepNeverCalled = false
          sharedState.neededIntakes -= 1
          sharedState.intakeActive = true
        } else {
          sharedState.intakeActive = active
        }
        sharedState.intakeIndex = index
        return r[STEP](a, v)
      },

      [RESULT]: (a) => {
        if (stepNeverCalled) {
          sharedState.activeIntakes = 0
        } else if (active) {
          sharedState.activeIntakes -= 1
        }
        return r[RESULT](a)
      }
    }
  })

const joinCollector = (sharedState, fn, inputs) =>
  transducer(r => {
    sharedState.activeIntakes = inputs.filter(isActive).length
    sharedState.neededIntakes = inputs.length
    const currentOutput = new Array(inputs.length)
    return {
      [STEP]: (a, v) => {
        if (sharedState.activeIntakes < 1) {
          return reduced(a)
        }
        currentOutput[sharedState.intakeIndex] = v
        return (sharedState.neededIntakes < 1 && sharedState.intakeActive)
          ? r[STEP](a, fn(...currentOutput))
          : a
      }
    }
  })

const join = (fn, inputs) => {
  // State is mutated by all joinIntake and joinCollector transducers.
  const state = {}

  return embed(
    net({
      ...Object.fromEntries(inputs.map((x, i) =>
        [i, xfnode(joinIntake(state, i, isActive(x)), [])])),
      out: xfnode(
        joinCollector(state, fn, inputs),
        inputs.map((_, i) => $[i]))
    }),
    Object.fromEntries(inputs
      .map(active)
      .map((input, i) => [i, input])))
}

const map = (fn, ...inputs) =>
  inputs.length <= 1 && isActive(inputs[0])
    ? simpleMap(fn, inputs[0] ?? [])
    : join(fn, inputs)

module.exports = {
  active,
  isActive,
  isPassive,
  map,
  passive
}
