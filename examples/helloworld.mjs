// Goal is to show off the smallest possible program.
import { chain, emit, map, run, sink, source } from '../src/xf/index.js'

// Example 1: smallest hello world
//

// rxf approach
const ex1_rxf = chain(
  source('init'),
  emit('Hello World!'),
  sink('log'))

// classic approach
const ex1_classic = () => {
  console.log('Hello World!')
}

run(ex1_rxf)
ex1_classic()


// Example 2: hello $USER
//

// rxf approach
const ex2_rxf = chain(
  source('init'),
  map(process => `Hello ${process.env.USER}!`),
  sink('log'))

// classic approach
const ex2_classic = () => {
  console.log(`Hello ${process.env.USER}!`)
}

run(ex2_rxf)
ex2_classic()
