const {
  emptyList,
  emptySet,
  initialEnv,
  makeList,
  makeSet,
  makeSym,
  read,
  readEval
} = require('../rep2')

test('makeList works', () => {
  expect(makeList()).toBe(emptyList)

  expect(makeList(1, 2, 3).toJS())
    .toStrictEqual([1, 2, 3])
})

test('makeSet works', () => {
  expect(makeSet()).toBe(emptySet)

  expect(makeSet([1, 1], [2, 2], [3, 3]).toJS())
    .toStrictEqual({ 1: 1, 2: 2, 3: 3 })
})

test('read works', () => {
  expect(read(''))
    .toStrictEqual(emptyList)

  expect(read('0 1 -1.25 true false "hello" foo'))
    .toStrictEqual(makeList(0, 1, -1.25, true, false,
      'hello', makeSym('foo')))

  expect(read('a:1').toJS())
    .toStrictEqual([[{ name: 'bind' }, { name: 'a' }, 1]])

  expect(read('a:b:1').toJS())
    .toStrictEqual([
      [{ name: 'bind' }, { name: 'a' },
        [{ name: 'bind' }, { name: 'b' }, 1]]])
})

const LSL = str =>
  readEval(initialEnv, str).get(makeSym('_'))

test('readEval works', () => {
  expect(LSL(''))
    .toBeUndefined()

  expect(LSL('1'))
    .toStrictEqual(1)

  expect(LSL('(+ 1 1)'))
    .toStrictEqual(2)
})
