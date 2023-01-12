// Goal is to show off the smallest possible program.
import { chain, source, emit, sink, run } from '../src/xf/index.js'

// Reactive approach
const hw1 = chain(
  source('init'),
  emit('Hello World!'),
  sink('log'))
run(hw1)

// Classic approach
const hw2 = () => {
  console.log('Hello World!')
}
hw2()
