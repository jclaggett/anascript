// Rules for this file
// 1. Coverage report should be at 100% when testing only this file.
// 2. Tests should be defined only in terms of the public API.

import { transduce, toArray } from '../reducing'
import { compose } from '../util'
import {
  after,
  dedupe,
  demultiplex,
  detag,
  drop,
  dropAll,
  dropWhile,
  emit,
  epilog,
  filter,
  filter2,
  flatMap,
  map,
  multiplex,
  partition,
  prolog,
  reductions,
  tag,
  take,
  takeWhile
} from '../xflib'

const data = [1, 2, 3]
const data2 = [1, 2, 2, 3, 2]

const T = (xf, data) =>
  transduce(xf(toArray), [], data)

test('flatMap works', () => {
  expect(T(flatMap(x => [x + 1, -x]), data))
    .toStrictEqual([2, -1, 3, -2, 4, -3])
})

test('map works', () => {
  expect(T(map(x => x + 1), data))
    .toStrictEqual([2, 3, 4])
})

test('emit works', () => {
  expect(T(emit(1), data))
    .toStrictEqual([1, 1, 1])
})

test('reductions works', () => {
  expect(T(reductions((x, y) => x + y, 0), data))
    .toStrictEqual([1, 3, 6])
})

test('filter works', () => {
  expect(T(filter(x => x % 2), data))
    .toStrictEqual([1, 3])
})

test('partition works', () => {
  expect(T(partition(2, 0), data))
    .toStrictEqual([[1, 2], [2, 3]])
  expect(T(partition(2, 1), data))
    .toStrictEqual([[1, 2], [2, 3]])
  expect(T(partition(2, 2), [1, 2, 3, 4, 5]))
    .toStrictEqual([[1, 2], [3, 4]])
  expect(T(partition(2, 3), [1, 2, 3, 4, 5]))
    .toStrictEqual([[1, 2], [4, 5]])
})

test('filter2 works', () => {
  expect(T(filter2((x, y) => x < y), data2))
    .toStrictEqual([1, 2, 3])
})

test('dedupe works', () => {
  expect(T(dedupe(), data2))
    .toStrictEqual([1, 2, 3, 2])
})

test('prolog works', () => {
  expect(T(prolog(42), data))
    .toStrictEqual([42, 1, 2, 3])
  expect(T(compose(prolog(42), take(1)), data))
    .toStrictEqual([42])
  expect(T(prolog(42), []))
    .toStrictEqual([42])
})

test('epilog works', () => {
  expect(T(epilog(42), data))
    .toStrictEqual([1, 2, 3, 42])
  expect(T(epilog(42), []))
    .toStrictEqual([42])
})

test('take works', () => {
  expect(T(take(-1), data))
    .toStrictEqual([])
  expect(T(take(0), data))
    .toStrictEqual([])
  expect(T(take(2), data))
    .toStrictEqual([1, 2])
})

test('takeWhile works', () => {
  expect(T(takeWhile(x => x < 2), data))
    .toStrictEqual([1])
})

test('drop works', () => {
  expect(T(drop(-1), data))
    .toStrictEqual(data)
  expect(T(drop(0), data))
    .toStrictEqual(data)
  expect(T(drop(2), data))
    .toStrictEqual([3])
})

test('dropWhile works', () => {
  expect(T(dropWhile(x => x < 2), data))
    .toStrictEqual([2, 3])
})

test('dropAll works', () => {
  expect(T(dropAll, data))
    .toStrictEqual([])
})

test('after works', () => {
  expect(T(after(42), data))
    .toStrictEqual([42])
})

test('tag works', () => {
  expect(T(tag(true), data))
    .toStrictEqual([[true, 1], [true, 2], [true, 3], [true]])
})

test('detag works', () => {
  expect(T(detag(true), data))
    .toStrictEqual([])
  expect(T(compose(tag(true), detag(true)), data))
    .toStrictEqual([1, 2, 3])
})

test('multiplex works', () => {
  expect(T(multiplex([]), data))
    .toStrictEqual(data)
  expect(T(multiplex([map(x => x + 1)]), data))
    .toStrictEqual([2, 3, 4])
  expect(T(multiplex([map(x => -x), take(2)]), data))
    .toStrictEqual([-1, 1, -2, 2, -3])
})

test('demultiplex works', () => {
  expect(T(compose(demultiplex(1), map(x => x + 1)), data))
    .toStrictEqual([2, 3, 4])

  const tail = compose(demultiplex(2), take(3))
  expect(T(multiplex([tail, tail]), data))
    .toStrictEqual([1, 1, 2])
})
