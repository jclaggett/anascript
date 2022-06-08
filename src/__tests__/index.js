const {
  makeList,
  makeSet,
  makeSym
} = require('../lang')

const {
  makeEnv,
  parse,
  print,
  printLabel,
  read,
  toJS
} = require('../index')

const RE = str =>
  makeEnv().eval(str)?.last()?.last()?.last()

const REJ = str =>
  toJS(RE(str))

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

test('read', () => {
  expect(read(''))
    .toStrictEqual(makeList())

  expect(read('0 1 -1.25 true false "hello" foo null undefined'))
    .toStrictEqual(makeList(0, 1, -1.25, true, false,
      'hello', makeSym('foo'), null, undefined))

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

test('readEval', () => {
  expect(REJ(''))
    .toStrictEqual(undefined)
  expect(REJ('1'))
    .toStrictEqual(1)
  expect(REJ('(+ 1 1)'))
    .toStrictEqual(2)
  expect(REJ('(eval a)'))
    .toStrictEqual(undefined)
  expect(REJ('(eval2 "a")'))
    .toStrictEqual('a')
  expect(REJ('(read "1")'))
    .toStrictEqual(1)
  expect(REJ('[1 2 3]'))
    .toStrictEqual([1, 2, 3])
  expect(REJ('{1 2 3}'))
    .toStrictEqual({ 1: 1, 2: 2, 3: 3 })

  expect(() => (REJ('(unknownFn 1 1)')))
    .toThrow()
})

test('labeling', () => {
  expect(REJ('a:[1 2 3] a'))
    .toStrictEqual([1, 2, 3])
  expect(REJ('a:b:[1 2 3] [a b]'))
    .toStrictEqual([[1, 2, 3], [1, 2, 3]])
  expect(REJ('a:[b c d]:[1 2 3] [a b c d]'))
    .toStrictEqual([[1, 2, 3], 1, 2, 3])
  expect(REJ('a:[b ...c ...d]:[1 2 3] [a b c d]'))
    .toStrictEqual([[1, 2, 3], 1, [2, 3], []])
  expect(REJ('a:[b ...[c ...d]]:[1 2 3] [a b c d]'))
    .toStrictEqual([[1, 2, 3], 1, 2, [3]])
  expect(REJ('a:[[b] ...[c ...d]]:[[1] 2 3] [a b c d]'))
    .toStrictEqual([[[1], 2, 3], 1, 2, [3]])
  expect(REJ('a:{b:"b" "c"}: {"b":1 "c":2} [a b $"c"]'))
    .toStrictEqual([{ b: 1, c: 2 }, 1, 2])
  expect(REJ('{a ...b}: {a:1 "b":2} [a b]'))
    .toStrictEqual([1, { b: 2 }])
  expect(REJ('[a b ...c ...d]: {0:1 1:2 2:3} [a b c d]'))
    .toStrictEqual([1, 2, { 2: 3 }, {}])
  expect(REJ('{a:0 b:1 ...c}: [1, 2, 3] [a b c]'))
    .toStrictEqual([1, 2, [3]])
  expect(() => REJ('{a b c}: 42'))
    .toThrow()
  expect(() => REJ('[a b c]: 42'))
    .toThrow()
})

test('special forms', () => {
  expect(REJ('#42'))
    .toStrictEqual(undefined)
  expect(REJ('\\"a"'))
    .toStrictEqual('a')
  expect(REJ('true:false $true'))
    .toStrictEqual(false)
  expect(REJ('a:1 $a'))
    .toStrictEqual(1)
  expect(REJ('(do 42 a:1 b:a $b)'))
    .toStrictEqual(1)
  expect(REJ('(if true "yes" "no")'))
    .toStrictEqual('yes')
  expect(REJ('(if false "yes" "no")'))
    .toStrictEqual('no')
  expect(REJ('(list* 1 2 3)'))
    .toStrictEqual([1, 2, 3])
  expect(REJ('(let (set* [\\a 42]) a)'))
    .toStrictEqual(42)
  expect(REJ('(fn args (+ ...args)) (_ 1 2 3)'))
    .toStrictEqual(6)
  expect(() => REJ('(conj null 42)'))
    .toThrow()
})

test('collection forms', () => {
  expect(REJ('[1 2 3]'))
    .toStrictEqual([1, 2, 3])
  expect(REJ('[1 2 3 ...[4 5]]'))
    .toStrictEqual([1, 2, 3, 4, 5])
  expect(REJ('{1 2 3}'))
    .toStrictEqual({ 1: 1, 2: 2, 3: 3 })
  expect(REJ('{1 2 3 ...{3 4 5}}'))
    .toStrictEqual({ 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 })
})

test('standard functions', () => {
  expect(REJ('(identity 42)'))
    .toStrictEqual(42)
  expect(REJ('(+ 1 1)'))
    .toStrictEqual(2)
  expect(REJ('(- 1 1)'))
    .toStrictEqual(0)
  expect(REJ('(get {a:1} \\a)'))
    .toStrictEqual(1)
  expect(() => REJ('(get 42 1)'))
    .toThrow()
  expect(REJ('(set* ["a" 2])'))
    .toStrictEqual({ a: 2 })
  expect(REJ('(push [1 2] 3)'))
    .toStrictEqual([1, 2, 3])
  expect(REJ('(pop [1 2 3])'))
    .toStrictEqual([1, 2])
  expect(REJ('(assoc {} "a" false)'))
    .toStrictEqual({ a: false })
  expect(REJ('(dissoc {"a":1 "b":2} "a")'))
    .toStrictEqual({ b: 2 })
  expect(REJ('(first [1 2 3])'))
    .toStrictEqual(1)
  expect(REJ('(last [1 2 3])'))
    .toStrictEqual(3)
  expect(REJ('[(list? 42) (list? [])]'))
    .toStrictEqual([false, true])
  expect(REJ('[(set? "ba") (set? {})]'))
    .toStrictEqual([false, true])
  expect(REJ('[(count []) (count {1 2 3})]'))
    .toStrictEqual([0, 3])
})

test('print', () => {
  expect(print(RE('[env 0 "a" true null undefined \\list \\a {1 a:2} (fn x null)]')))
    .toBeDefined()
  expect(print(RE('42'), {}))
    .toStrictEqual(42)
  expect(printLabel(makeList(makeSym('label'), 1, 1)))
    .toBeDefined()
})

test('makeEnv', () => {
  const env = makeEnv()
  expect(env.eval('"hello world"'))
    .toBeDefined()
})
