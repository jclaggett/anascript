const im = require('immutable')

const {
  form,
  initialEnv,
  getCurrentEnv,
  setCurrentEnv,
  makeList,
  makeSet,
  makeSym,
  parse,
  read,
  readEval,
  readEvalPrint,
  toJS
} = require('../rep2')

test('setCurrentEnv', () => {
  expect(setCurrentEnv('smoke-test', 42))
    .toStrictEqual(undefined)
  expect(getCurrentEnv('smoke-test'))
    .toStrictEqual(42)
})

test('makeList', () => {
  expect(makeList().toJS())
    .toStrictEqual([])

  expect(makeList(1, 2, 3).toJS())
    .toStrictEqual([1, 2, 3])
})

test('makeSet', () => {
  expect(makeSet().toJS())
    .toStrictEqual({})

  expect(makeSet([1, 1], [2, 2], [3, 3]).toJS())
    .toStrictEqual({ 1: 1, 2: 2, 3: 3 })
})

test('parse', () => {
  expect(parse(''))
    .toBeDefined()
  expect(parse('1'))
    .toBeDefined()
  expect(() => parse('['))
    .toThrow()
})

test('form', () => {
  expect(form(parse('')))
    .toStrictEqual(makeList())
  expect(form(parse('1 2 3')))
    .toStrictEqual(makeList(1, 2, 3))
  expect(() => form({ type: 'unexpectedType' }))
    .toThrow()
})

test('read', () => {
  expect(read(''))
    .toStrictEqual(makeList())

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

test('toJS', () => {
  expect(toJS(42))
    .toStrictEqual(42)
  expect(toJS(read('42')))
    .toStrictEqual([42])
})

const runRE = str =>
  readEval(initialEnv, str).get(makeSym('_'))

test('readEval', () => {
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
  expect(toJS(runRE('{a ...b}: {a:1 "b":2} [a b]')))
    .toStrictEqual([1, { b: 2 }])
  expect(toJS(runRE('[a b ...c]: {0:1 1:2 2:3} [a b c]')))
    .toStrictEqual([1, 2, { 2: 3 }])
  expect(toJS(runRE('{a:0 b:1 ...c}: [1, 2, 3] [a b c]')))
    .toStrictEqual([1, 2, [3]])

  expect(() => toJS(runRE('(unknownFn 1 1)')))
    .toThrow()
})

test('special forms', () => {
  expect(toJS(runRE('#42')))
    .toStrictEqual(undefined)
  expect(toJS(runRE('\\"a"')))
    .toStrictEqual('a')
  expect(toJS(runRE('true:false $true')))
    .toStrictEqual(false)
  expect(toJS(runRE('a:1 $a')))
    .toStrictEqual(1)
  expect(toJS(runRE('(do 42 a:1 b:a $b)')))
    .toStrictEqual(1)
  expect(toJS(runRE('(if true "yes" "no")')))
    .toStrictEqual('yes')
  expect(toJS(runRE('(if false "yes" "no")')))
    .toStrictEqual('no')
  expect(toJS(runRE('(list* 1 2 3)')))
    .toStrictEqual([1, 2, 3])
  expect(toJS(runRE('(let (set* [\\a 42]) a)')))
    .toStrictEqual(42)
  expect(toJS(runRE('(fn args (+ ...args)) (_ 1 2 3)')))
    .toStrictEqual(6)
})

test('collection forms', () => {
  expect(toJS(runRE('[1 2 3]')))
    .toStrictEqual([1, 2, 3])
  expect(toJS(runRE('[1 2 3 ...[4 5]]')))
    .toStrictEqual([1, 2, 3, 4, 5])
  expect(toJS(runRE('{1 2 3}')))
    .toStrictEqual({ 1: 1, 2: 2, 3: 3 })
  expect(toJS(runRE('{1 2 3 ...{3 4 5}}')))
    .toStrictEqual({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 })
})

test('standard functions', () => {
  expect(toJS(runRE('(identity 42)')))
    .toStrictEqual(42)
  expect(toJS(runRE('(+ 1 1)')))
    .toStrictEqual(2)
  expect(toJS(runRE('(- 1 1)')))
    .toStrictEqual(0)
  expect(toJS(runRE('(get {a:1} \\a)')))
    .toStrictEqual(1)
  expect(() => toJS(runRE('(get 42 1)')))
    .toThrow()
  expect(toJS(runRE('(set* ["a" 2])')))
    .toStrictEqual({ a: 2 })
  expect(toJS(runRE('(push [1 2] 3)')))
    .toStrictEqual([1, 2, 3])
  expect(toJS(runRE('(pop [1 2 3])')))
    .toStrictEqual([1, 2])
  expect(toJS(runRE('(assoc {} "a" false)')))
    .toStrictEqual({ a: false })
  expect(toJS(runRE('(dissoc {"a":1 "b":2} "a")')))
    .toStrictEqual({ b: 2 })
  expect(toJS(runRE('(first [1 2 3])')))
    .toStrictEqual(1)
  expect(toJS(runRE('(last [1 2 3])')))
    .toStrictEqual(3)
  expect(toJS(runRE('[(list? 42) (list? [])]')))
    .toStrictEqual([false, true])
  expect(toJS(runRE('[(set? "ba") (set? {})]')))
    .toStrictEqual([false, true])
  expect(toJS(runRE('[(count []) (count {1 2 3})]')))
    .toStrictEqual([0, 3])
})

const runREP = str =>
  typeof readEvalPrint(str).first()

test('readEvalPrint', () => {
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
