const im = require('immutable')

const {
  emptyList,
  emptySet,
  form,
  initialEnv,
  makeList,
  makeSet,
  makeSym,
  parse,
  read,
  readEval,
  readEvalPrint
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

test('parse works', () => {
  expect(parse(''))
    .toBeDefined()
  expect(parse('1'))
    .toBeDefined()
  expect(() => parse('['))
    .toThrow()
})

test('form works', () => {
  expect(form(parse('')))
    .toStrictEqual(emptyList)
  expect(form(parse('1 2 3')))
    .toStrictEqual(makeList(1, 2, 3))
  expect(() => form({ type: 'unexpectedType' }))
    .toThrow()
})

test('read works', () => {
  expect(read(''))
    .toStrictEqual(emptyList)

  expect(read('0 1 -1.25 true false "hello" foo'))
    .toStrictEqual(makeList(0, 1, -1.25, true, false,
      'hello', makeSym('foo')))

  expect(read('a:1').toJS())
    .toStrictEqual([[{ name: 'label' }, { name: 'a' }, 1]])

  expect(read('a:b:1').toJS())
    .toStrictEqual([
      [{ name: 'label' }, { name: 'a' },
        [{ name: 'label' }, { name: 'b' }, 1]]])
})

const toJS = x =>
  x instanceof im.Collection
    ? x.toJS()
    : x

const runRE = str =>
  readEval(initialEnv, str).get(makeSym('_'))

test('readEval works', () => {
  expect(toJS(runRE('')))
    .toStrictEqual(undefined)
  expect(toJS(runRE('1')))
    .toStrictEqual(1)
  expect(toJS(runRE('(+ 1 1)')))
    .toStrictEqual(2)
  expect(toJS(runRE('(eval a)')))
    .toStrictEqual(undefined)
  expect(toJS(runRE('(eval2 "a")')))
    .toStrictEqual('a')
  expect(toJS(runRE('(read "1")')))
    .toStrictEqual(1)
  expect(toJS(runRE('[1 2 3]')))
    .toStrictEqual([1, 2, 3])
  expect(toJS(runRE('{1 2 3}')))
    .toStrictEqual({ 1: 1, 2: 2, 3: 3 })
  expect(toJS(runRE('a:[1 2 3] a')))
    .toStrictEqual([1, 2, 3])
  expect(toJS(runRE('a:b:[1 2 3] [a b]')))
    .toStrictEqual([[1, 2, 3], [1, 2, 3]])
  expect(toJS(runRE('a:[b c d]:[1 2 3] [a b c d]')))
    .toStrictEqual([[1, 2, 3], 1, 2, 3])
  expect(toJS(runRE('a:[b ...c ...d]:[1 2 3] [a b c d]')))
    .toStrictEqual([[1, 2, 3], 1, [2, 3], []])
  expect(toJS(runRE('a:[b ...[c ...d]]:[1 2 3] [a b c d]')))
    .toStrictEqual([[1, 2, 3], 1, 2, [3]])
  expect(toJS(runRE('a:[[b] ...[c ...d]]:[[1] 2 3] [a b c d]')))
    .toStrictEqual([[[1], 2, 3], 1, 2, [3]])
  expect(toJS(runRE('a:{b:"b" "c"}: {"b":1 "c":2} [a b $"c"]')))
    .toStrictEqual([{ b: 1, c: 2 }, 1, 2])

  expect(() => toJS(runRE('(unknownFn 1 1)')))
    .toThrow()
})

test('special forms work', () => {
  expect(toJS(runRE('#42')))
    .toStrictEqual(null)
  expect(toJS(runRE('\\"a"')))
    .toStrictEqual('a')
  expect(toJS(runRE('true:false $true')))
    .toStrictEqual(false)
  expect(toJS(runRE('a:1 $a')))
    .toStrictEqual(1)
  expect(toJS(runRE('(do 42 a:1 b:a $b)')))
    .toStrictEqual(1)
})

const runREP = str =>
  typeof readEvalPrint(str).first()

test('readEvalPrint works', () => {
  expect(runREP('1 2 true false null undefined'))
    .toBe('string')
  expect(runREP('"hello" $a \\a [1 2] {1 2} a:1'))
    .toBe('string')
  expect(runREP('+ label'))
    .toBe('string')
  expect(runREP(''))
    .toStrictEqual('undefined')
  expect(runREP('('))
    .toStrictEqual('undefined')
})
