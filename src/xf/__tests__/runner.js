// Rules for this file
// 1. Coverage report should be at 100% when testing only this file.
// 2. Tests should be defined only in terms of the public API.

import { jest } from '@jest/globals'
import { flatMap, map, take } from '../xflib'
import { $ } from '../pathref'
import { graph } from '../graph'
import { run, source, sink } from '../runner'

beforeAll(() => {
  console.debug = jest.fn()
  console.log = jest.fn()
  console.warn = jest.fn()
})

test('run works', async () => {
  expect(await run(graph()))
    .toStrictEqual(undefined)

  expect(await run(graph({
    a: source('init'),
    b: sink('debug')
  })))
    .toStrictEqual(undefined)

  expect(await run(graph({
    a: source('init'),
    b: map(x => x.argv[0]),
    c: map(x => x.env.USER),
    d: sink('debug')
  }, [
    [$.a, $.b], [$.a, $.c], [$.b, $.d], [$.c, $.d]
  ]), 'hello'))
    .toStrictEqual(undefined)

  expect(await run(graph({
    a: source('init'),
    b: take(0),
    c: sink('debug')
  }, [[$.a, $.b], [$.b, $.c]])))
    .toStrictEqual(undefined)
})

test('various sources and sinks work', async () => {
  expect(await run(graph({
    bad1: source('badSource'),
    bad2: sink('badSink')
  }, [[$.bad1, $.bad2]])))
    .toStrictEqual(undefined)

  expect(await run(graph({
    a: source('dir', '.'),
    b: take(1),
    c: sink('debug')
  }, [[$.a, $.b], [$.b, $.c]])))
    .toStrictEqual(undefined)

  expect(await run(graph({
    a: source('time', { freq: 0 }),
    b: take(2),
    c: map(ts => p => [ts, p]),
    d: sink('process')
  }, [[$.a, $.b], [$.b, $.c], [$.c, $.d]])))
    .toStrictEqual(undefined)

  expect(await run(graph({
    a: source('init'),
    b: flatMap(x => [x.env.USER, x.env.HOME]),
    fooOut: sink('pipe', 'foo'),
    fooIn: source('pipe', 'foo'),
    c: take(1),
    d: sink('log')
  }, [[$.a, $.b], [$.b, $.fooOut], [$.fooIn, $.c], [$.c, $.d]])))
    .toStrictEqual(undefined)
})

test('pipes work', async () => {
  expect(await run(graph({
    a: source('init'),
    fooPipe: source('pipe', 'foo'),
    barPipe: sink('pipe', 'bar')
  }, [[$.a, $.barPipe]])))
    .toStrictEqual(undefined)

  expect(await run(graph({
    a: source('init'),
    b: flatMap(x => [x.env.USER, x.env.HOME]),
    fooOut: sink('pipe', 'foo'),
    fooIn: source('pipe', 'foo'),
    c: take(1),
    d: sink('log')
  }, [[$.a, $.b], [$.b, $.fooOut], [$.fooIn, $.c], [$.c, $.d]])))
    .toStrictEqual(undefined)
})
