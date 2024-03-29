// Rules for this file
// 1. Coverage report should be at 100% when testing only this file.
// 2. Tests should be defined only in terms of the public API.
import {
  makeEnv,
  parse,
  print,
  printLabel,
  printSyntax,
  emitTree,
  read,
  toJS,
  transform,
  sym
} from '../index'

const RE = str =>
  makeEnv().eval(str)?.last()?.last()?.last()

const REJ = str =>
  toJS(RE(str))

test('parse', () => {
  expect(parse(''))
    .toBeDefined()
  expect(parse('1'))
    .toBeDefined()
  expect(() => parse('['))
    .toThrow()
})

test('emitTree', () => {
  expect(emitTree(transform(parse('0 true "hello" foo null undefined'))))
    .toBeUndefined()
})

test('read', () => {
  expect(read('').toJS())
    .toStrictEqual([])

  expect(read('0 1 -1.25 true false "hello" foo null undefined').toJS())
    .toStrictEqual([0, 1, -1.25, true, false,
      'hello', { sym: 'foo' }, null, undefined])

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

test('makeEnv', () => {
  const env = makeEnv()
  expect(env.eval('"hello world"'))
    .toBeDefined()
})

test('simple use', () => {
  expect(REJ(''))
    .toStrictEqual(undefined)
  expect(REJ('42'))
    .toStrictEqual(42)
  expect(REJ('(read "1")'))
    .toStrictEqual([1])
  expect(REJ('[true "a" null]'))
    .toStrictEqual([true, 'a', null])
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
  expect(REJ('{a:0 b c:1}: [1, b:2, 3] [a b c]'))
    .toStrictEqual([1, 2, 3])
  expect(() => REJ('{a b c}: 42'))
    .toThrow()
  expect(() => REJ('[a b c]: 42'))
    .toThrow()
})

test('special forms', () => {
  expect(REJ('#42'))
    .toStrictEqual(undefined)
  expect(REJ('(eval a)'))
    .toStrictEqual(undefined)
  expect(REJ('(eval2 "a")'))
    .toStrictEqual('a')
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
  expect(REJ('(fn [x] x) [(_ 1) (_ true) (_ []) (_ {})]'))
    .toStrictEqual([1, true, [], {}])
  expect(REJ('(fn {a b:0} [a b]) [(_ 1 2) (_ a:1 2) (_ 1 a:2)]'))
    .toStrictEqual([[undefined, 1], [1, 2], [2, 1]])
  expect(REJ('(conj [] 1 2 3)'))
    .toStrictEqual([1, 2, 3])
  expect(REJ('(conj [1 2 3] 4)'))
    .toStrictEqual([1, 2, 3, 4])
  expect(REJ('(conj [1 2 3] "a":4)'))
    .toStrictEqual({ 0: 1, 1: 2, 2: 3, a: 4 })
  expect(REJ('(conj {1 2 3} "a":4)'))
    .toStrictEqual({ 1: 1, 2: 2, 3: 3, a: 4 })
  expect(() => REJ('(conj null 42)'))
    .toThrow()
})

test('common functions', () => {
  expect(REJ('(identity 42)'))
    .toStrictEqual(42)
  expect(REJ('[(= 1 1) (= null null) (= "a" "b")]'))
    .toStrictEqual([true, true, false])
  expect(REJ('(str \\a "b" 2)'))
    .toStrictEqual('ab2')
  expect(REJ('(sym \\a "b" 2)'))
    .toStrictEqual(sym('ab2'))
})

test('boolean functions', () => {
  expect(REJ('[(not) (not false) (not true false) (not true true (not-evaled))]'))
    .toStrictEqual([null, true, true, false])
  expect(REJ('[(and) (and true) (and true true) (and true false (not-evaled))]'))
    .toStrictEqual([true, true, true, false])
  expect(REJ('[(or) (or false) (or false false) (or false true (not-evaled))]'))
    .toStrictEqual([false, false, false, true])
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

test('set functions', () => {
  expect(REJ('[(set? "ba") (set? {})]'))
    .toStrictEqual([false, true])
  expect(REJ('(complement (complement {}))'))
    .toStrictEqual({})
  expect(REJ('(= (remove {}) ~{})'))
    .toStrictEqual(true)
  expect(REJ('(= ~{1 2} (remove {1 2}))'))
    .toStrictEqual(true)
  expect(REJ('(remove {1 2} {2 3})'))
    .toStrictEqual({ 1: 1 })
  expect(REJ('(remove (remove ~{1 2} {2 3}))'))
    .toStrictEqual({ 1: 1, 2: 2, 3: 3 })
  expect(REJ('(remove {1 2} ~{2 3})'))
    .toStrictEqual({ 2: 2 })
  expect(REJ('(remove ~{1 2} ~{2 3})'))
    .toStrictEqual({ 3: 3 })
  expect(REJ('(keep {1 2} {2 3})'))
    .toStrictEqual({ 2: 2 })
  expect(REJ('(merge {1 2} {2 3})'))
    .toStrictEqual({ 1: 1, 2: 2, 3: 3 })
  expect(REJ('[(remove) (merge) (remove (keep))]'))
    .toStrictEqual([null, {}, {}])
  expect(REJ(`
    [(subset? {1 2} {2})
     (subset? ~{1 2} {3})
     (subset? ~{1 2} {3 4 5})
     (subset? {3} ~{1 2})
     (subset? ~{1} ~{1 2})]`))
    .toStrictEqual([true, true, true, false, true])
  expect(REJ(`
    [(superset? {1 2} {2})
     (superset? ~{1 2} {3})
     (superset? {3} ~{1 2})
     (superset? {3 4 5} ~{1 2})
     (superset? ~{1} ~{1 2})]`))
    .toStrictEqual([false, false, true, true, false])
  expect(REJ('[(abs {}) (abs ~{}) (abs "bar")]'))
    .toStrictEqual([{}, {}, 'bar'])
})

test('math functions', () => {
  expect(REJ('[(number? "ba") (number? 42)]'))
    .toStrictEqual([false, true])
  expect(REJ('(pos? 2)'))
    .toStrictEqual(true)
  expect(REJ('(pos? -2)'))
    .toStrictEqual(false)
  expect(REJ('(zero? 0)'))
    .toStrictEqual(true)
  expect(REJ('(zero? 99)'))
    .toStrictEqual(false)
  expect(REJ('(neg? 9)'))
    .toStrictEqual(false)
  expect(REJ('(neg? -8)'))
    .toStrictEqual(true)
  expect(REJ('(+ 1 1)'))
    .toStrictEqual(2)
  expect(REJ('(- 1 1)'))
    .toStrictEqual(0)
  expect(REJ('(- 42)'))
    .toStrictEqual(-42)
  expect(REJ('(-)'))
    .toStrictEqual(NaN)
  expect(REJ('(* 1 2 3)'))
    .toStrictEqual(6)
  expect(REJ('(/)'))
    .toStrictEqual(NaN)
  expect(REJ('(/ 1 2)'))
    .toStrictEqual(0.5)
  expect(REJ('(pow 2 3)'))
    .toStrictEqual(8)
  expect(REJ('(log10 100 2)'))
    .toStrictEqual(2)
  expect(REJ('(log2 8 3)'))
    .toStrictEqual(3)
  expect(REJ('[(bit-not) (bit-not 0) (bit-not 3 1)]'))
    .toStrictEqual([null, -1, 2])
  expect(REJ('[(bit-and) (bit-and 3) (bit-and 2 1)]'))
    .toStrictEqual([-1, 3, 0])
  expect(REJ('[(bit-or) (bit-or 3) (bit-or 2 1)]'))
    .toStrictEqual([0, 3, 3])
  expect(REJ('[(bit-xor) (bit-xor 3) (bit-xor 3 1)]'))
    .toStrictEqual([0, 3, 2])
  expect(REJ('[(abs 42) (abs -3) (abs "foo")]'))
    .toStrictEqual([42, 3, 'foo'])
})

test('collection functions', () => {
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
  expect(REJ('[(count []) (count {1 2 3})]'))
    .toStrictEqual([0, 3])
  expect(REJ('[(keys) (keys 42) (keys [1 2 3]) (keys {1:true 2:false 3:null})]'))
    .toStrictEqual([null, null, [0, 1, 2], { 1: 1, 2: 2, 3: 3 }])
})

test('print', () => {
  expect(print(makeEnv().eval('[_env 0 "a" true null undefined \\list \\a {1 a:2} (fn x null) ~{1 2 3}]')))
    .toBeDefined()
  expect(print(makeEnv().eval('42').last().last().last(), {}))
    .toStrictEqual(42)
})

test('printLabel', () => {
  expect(printLabel(makeEnv().eval('42')))
    .toStrictEqual('')
})

test('printSyntax', () => {
  expect(printSyntax(makeEnv().eval('[_env 0 "a" true null undefined \\list \\a {1 a:2} (fn x null) ~{1 2 3}]')))
    .toBeDefined()
})
