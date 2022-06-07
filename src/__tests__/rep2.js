const {
  form,
  initialEnv,
  makeList,
  makeSet,
  makeSym,
  parse,
  read,
  readEval,
  toJS
} = require('../rep2')

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
    .toStrictEqual([[{ sym: 'label' }, { sym: 'a' }, 1]])

  expect(read('a:b:1').toJS())
    .toStrictEqual([
      [{ sym: 'label' }, { sym: 'a' },
        [{ sym: 'label' }, { sym: 'b' }, 1]]])
})

test('toJS', () => {
  expect(toJS(42))
    .toStrictEqual(42)
  expect(toJS(read('42')))
    .toStrictEqual([42])
})

const E = str =>
  toJS(readEval(initialEnv, str).get(makeSym('_')))

test('readEval', () => {
  expect(E(''))
    .toStrictEqual(undefined)
  expect(E('1'))
    .toStrictEqual(1)
  expect(E('(+ 1 1)'))
    .toStrictEqual(2)
  expect(E('(eval a)'))
    .toStrictEqual(undefined)
  expect(E('(eval2 "a")'))
    .toStrictEqual('a')
  expect(E('(read "1")'))
    .toStrictEqual(1)
  expect(E('[1 2 3]'))
    .toStrictEqual([1, 2, 3])
  expect(E('{1 2 3}'))
    .toStrictEqual({ 1: 1, 2: 2, 3: 3 })
  expect(E('a:[1 2 3] a'))
    .toStrictEqual([1, 2, 3])
  expect(E('a:b:[1 2 3] [a b]'))
    .toStrictEqual([[1, 2, 3], [1, 2, 3]])
  expect(E('a:[b c d]:[1 2 3] [a b c d]'))
    .toStrictEqual([[1, 2, 3], 1, 2, 3])
  expect(E('a:[b ...c ...d]:[1 2 3] [a b c d]'))
    .toStrictEqual([[1, 2, 3], 1, [2, 3], []])
  expect(E('a:[b ...[c ...d]]:[1 2 3] [a b c d]'))
    .toStrictEqual([[1, 2, 3], 1, 2, [3]])
  expect(E('a:[[b] ...[c ...d]]:[[1] 2 3] [a b c d]'))
    .toStrictEqual([[[1], 2, 3], 1, 2, [3]])
  expect(E('a:{b:"b" "c"}: {"b":1 "c":2} [a b $"c"]'))
    .toStrictEqual([{ b: 1, c: 2 }, 1, 2])
  expect(E('{a ...b}: {a:1 "b":2} [a b]'))
    .toStrictEqual([1, { b: 2 }])
  expect(E('[a b ...c]: {0:1 1:2 2:3} [a b c]'))
    .toStrictEqual([1, 2, { 2: 3 }])
  expect(E('{a:0 b:1 ...c}: [1, 2, 3] [a b c]'))
    .toStrictEqual([1, 2, [3]])

  expect(() => (E('(unknownFn 1 1)')))
    .toThrow()
})

test('special forms', () => {
  expect(E('#42'))
    .toStrictEqual(undefined)
  expect(E('\\"a"'))
    .toStrictEqual('a')
  expect(E('true:false $true'))
    .toStrictEqual(false)
  expect(E('a:1 $a'))
    .toStrictEqual(1)
  expect(E('(do 42 a:1 b:a $b)'))
    .toStrictEqual(1)
  expect(E('(if true "yes" "no")'))
    .toStrictEqual('yes')
  expect(E('(if false "yes" "no")'))
    .toStrictEqual('no')
  expect(E('(list* 1 2 3)'))
    .toStrictEqual([1, 2, 3])
  expect(E('(let (set* [\\a 42]) a)'))
    .toStrictEqual(42)
  expect(E('(fn args (+ ...args)) (_ 1 2 3)'))
    .toStrictEqual(6)
})

test('collection forms', () => {
  expect(E('[1 2 3]'))
    .toStrictEqual([1, 2, 3])
  expect(E('[1 2 3 ...[4 5]]'))
    .toStrictEqual([1, 2, 3, 4, 5])
  expect(E('{1 2 3}'))
    .toStrictEqual({ 1: 1, 2: 2, 3: 3 })
  expect(E('{1 2 3 ...{3 4 5}}'))
    .toStrictEqual({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 })
})

test('standard functions', () => {
  expect(E('(identity 42)'))
    .toStrictEqual(42)
  expect(E('(+ 1 1)'))
    .toStrictEqual(2)
  expect(E('(- 1 1)'))
    .toStrictEqual(0)
  expect(E('(get {a:1} \\a)'))
    .toStrictEqual(1)
  expect(() => E('(get 42 1)'))
    .toThrow()
  expect(E('(set* ["a" 2])'))
    .toStrictEqual({ a: 2 })
  expect(E('(push [1 2] 3)'))
    .toStrictEqual([1, 2, 3])
  expect(E('(pop [1 2 3])'))
    .toStrictEqual([1, 2])
  expect(E('(assoc {} "a" false)'))
    .toStrictEqual({ a: false })
  expect(E('(dissoc {"a":1 "b":2} "a")'))
    .toStrictEqual({ b: 2 })
  expect(E('(first [1 2 3])'))
    .toStrictEqual(1)
  expect(E('(last [1 2 3])'))
    .toStrictEqual(3)
  expect(E('[(list? 42) (list? [])]'))
    .toStrictEqual([false, true])
  expect(E('[(set? "ba") (set? {})]'))
    .toStrictEqual([false, true])
  expect(E('[(count []) (count {1 2 3})]'))
    .toStrictEqual([0, 3])
})
