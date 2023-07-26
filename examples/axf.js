import t from 'transducist'
import * as xf from '../src/xf/index.js'
import * as readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

// Goal is to demonstrate an asynchronous transducer

const rl = readline.createInterface({ input: stdin, output: stdout })

export const run = async () => {
  // start with a normal transducer:
  const sampleXf = xf.compose(xf.take(2), xf.map(x => x + 1))

  // use it on some values
  const result1 = t.transduce([1, 2, 3], sampleXf, t.toArray())

  const axf = xf.transducer(
    r => {
      return {
        [xf.STEP]: async (a, x) => {
          while (!(xf.isReduced(a) || isNaN(x))) {
            a = r[xf.STEP](a, x)
            x = parseInt(await rl.question('What is the next number? '))
          }
          return a
        }
      }
    }
  )

  const arf = axf(t.toArray())
  let a = arf[xf.INIT]()
  a = await arf[xf.STEP](a, 1)
  a = await arf[xf.STEP](a, 2)
  a = await arf[xf.STEP](a, 3)
  a = arf[xf.RESULT](a)
  const result2 = a
  return { result1, result2 }
}

console.dir(await run())
