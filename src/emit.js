import * as lang from './lang.js'
import { read } from './read.js'

const q = (s) => JSON.stringify(s)

const emitFail = (msg) => {
  throw new Error(`emit: ${msg}`)
}

const assert = (ok, msg) => {
  if (!ok) emitFail(msg)
}

const emitLiteral = (exp) =>
  exp === undefined
    ? 'undefined'
    : JSON.stringify(exp)

const emitSym = (exp, envName) =>
  `${envName}.get(lang.sym(${q(exp.sym)}))`

const emitCall = (exp, envName) => {
  assert(lang.isList(exp) && exp.count() > 0, 'call expects non-empty list')
  const fnText = emitAstExpr(exp.first(), envName)
  const argsText = exp
    .rest()
    .map(arg => emitAstExpr(arg, envName))
    .join(', ')
  return `${fnText}(lang.makeList(${argsText}))`
}

// Label destructuring emission (Milestone 3)
const collectLabelChain = (exp) => {
  const lhses = []
  let rhs = exp
  while (lang.isForm(rhs, 'label')) {
    lhses.push(rhs.get(1))
    rhs = rhs.get(2)
  }
  return { lhses, rhs }
}

const emitSimpleLabelLhs = (lhs) => {
  assert(!(lang.isList(lhs) || lang.isSet(lhs)),
    `label lhs destructuring is not supported in emit yet (got ${lang.getType(lhs)})`)
  if (lang.isSym(lhs)) {
    return `lang.sym(${q(lhs.sym)})`
  }
  return emitLiteral(lhs)
}

const getLabelKey = (exp) =>
  lang.isForm(exp, 'label')
    ? getLabelKey(exp.get(2))
    : exp

// Mirrors evalCallAtom semantics used by label key extraction:
// - lists are evaluated
// - atoms (including symbols) evaluate to themselves
const emitCallAtomExpr = (exp, envName) => {
  if (lang.isList(exp)) {
    return emitAstExpr(exp, envName)
  }
  if (lang.isSym(exp)) {
    return `lang.sym(${q(exp.sym)})`
  }
  return emitLiteral(exp)
}

const emitNumericRangeList = (n) =>
  n <= 0
    ? 'lang.makeList()'
    : `lang.makeList(${Array.from({ length: n }, (_, i) => i).join(', ')})`

const emitBindTypeBranch = (tmp, listBody, setBody, kind) =>
  `const ${tmp} = VALUE_EXPR; if (lang.isList(${tmp})) { ${listBody} } else if (lang.isSet(${tmp})) { ${setBody} } else { lang.throwError("Unable to use ${kind} destructure on " + lang.getType(${tmp})); }`

const emitBindPattern = (pattern, valueExpr, envName, nextTemp) => {
  if (lang.isForm(pattern, 'list')) {
    return emitBindListPattern(pattern, valueExpr, envName, nextTemp)
  }
  if (lang.isForm(pattern, 'set')) {
    return emitBindSetPattern(pattern, valueExpr, envName, nextTemp)
  }

  const keys = lang.isForm(pattern, 'label')
    ? collectLabelChain(pattern).lhses
    : [pattern]
  return keys
    .map((lhs) => `${envName} = ${envName}.set(${emitSimpleLabelLhs(lhs)}, ${valueExpr});`)
    .join(' ')
}

const emitBindListFromList = (tmp, entries, envName, nextTemp) => {
  const lines = []
  let i = 0
  let spreadSeen = false
  for (const x of entries) {
    if (lang.isForm(x, 'spread')) {
      const target = x.get(1)
      const restExpr = spreadSeen ? 'lang.makeList()' : `${tmp}.slice(${i})`
      lines.push(emitBindPattern(target, restExpr, envName, nextTemp))
      spreadSeen = true
      continue
    }
    lines.push(emitBindPattern(x, `${tmp}.get(${i})`, envName, nextTemp))
    i += 1
  }
  return lines.join(' ')
}

const emitBindListFromSet = (tmp, entries, envName, nextTemp) => {
  const lines = []
  let i = 0
  let spreadSeen = false
  for (const x of entries) {
    if (lang.isForm(x, 'spread')) {
      const target = x.get(1)
      const restExpr = spreadSeen
        ? 'lang.makeSet()'
        : `${tmp}.deleteAll(${emitNumericRangeList(i)})`
      lines.push(emitBindPattern(target, restExpr, envName, nextTemp))
      spreadSeen = true
      continue
    }
    lines.push(emitBindPattern(x, `${tmp}.get(${i})`, envName, nextTemp))
    i += 1
  }
  return lines.join(' ')
}

function emitBindListPattern (pattern, valueExpr, envName, nextTemp) {
  const tmp = nextTemp('src')
  const entries = pattern.rest().toArray()
  const listBody = emitBindListFromList(tmp, entries, envName, nextTemp)
  const setBody = emitBindListFromSet(tmp, entries, envName, nextTemp)
  return emitBindTypeBranch(tmp, listBody, setBody, 'list')
    .replace('VALUE_EXPR', valueExpr)
}

const emitBindSetFromList = (tmp, entries, envName, nextTemp) => {
  const maxKey = nextTemp('max')
  const lines = [`let ${maxKey} = 0;`]
  for (const x of entries) {
    if (lang.isForm(x, 'spread')) {
      lines.push(emitBindPattern(x.get(1), `${tmp}.slice(${maxKey} + 1)`, envName, nextTemp))
      continue
    }
    const keyVar = nextTemp('key')
    lines.push(`const ${keyVar} = ${emitCallAtomExpr(getLabelKey(x), envName)};`)
    lines.push(`if (${keyVar} > ${maxKey}) ${maxKey} = ${keyVar};`)
    lines.push(emitBindPattern(x, `${tmp}.get(${keyVar})`, envName, nextTemp))
  }
  return lines.join(' ')
}

const emitBindSetFromSet = (tmp, entries, envName, nextTemp) => {
  const keysTaken = nextTemp('keys')
  const lines = [`let ${keysTaken} = lang.makeList();`]
  for (const x of entries) {
    if (lang.isForm(x, 'spread')) {
      lines.push(emitBindPattern(x.get(1), `${tmp}.deleteAll(${keysTaken})`, envName, nextTemp))
      continue
    }
    const keyVar = nextTemp('key')
    lines.push(`const ${keyVar} = ${emitCallAtomExpr(getLabelKey(x), envName)};`)
    lines.push(`${keysTaken} = ${keysTaken}.push(${keyVar});`)
    lines.push(emitBindPattern(x, `${tmp}.get(${keyVar})`, envName, nextTemp))
  }
  return lines.join(' ')
}

function emitBindSetPattern (pattern, valueExpr, envName, nextTemp) {
  const tmp = nextTemp('src')
  const entries = pattern.rest().toArray()
  const listBody = emitBindSetFromList(tmp, entries, envName, nextTemp)
  const setBody = emitBindSetFromSet(tmp, entries, envName, nextTemp)
  return emitBindTypeBranch(tmp, listBody, setBody, 'set')
    .replace('VALUE_EXPR', valueExpr)
}

const emitLabel = (exp, envName) => {
  assert(lang.isForm(exp, 'label'), 'label form expected')
  const { lhses, rhs } = collectLabelChain(exp)
  if (lhses.length === 1 && !(lang.isList(lhses[0]) || lang.isSet(lhses[0]))) {
    return `${envName} = ${envName}.set(${emitSimpleLabelLhs(lhses[0])}, ${emitAstExpr(rhs, envName)})`
  }
  let n = 0
  const nextTemp = (prefix = 'tmp') => `__label_${prefix}${n++}`
  const rhsTmp = nextTemp('rhs')
  const steps = lhses
    .map((lhs) => emitBindPattern(lhs, rhsTmp, envName, nextTemp))
    .join(' ')
  return `${envName} = (() => { const ${rhsTmp} = ${emitAstExpr(rhs, envName)}; ${steps} return ${envName}; })()`
}

const emitFn = (exp, envName) => {
  assert(lang.isForm(exp, 'fn'), 'fn form expected')
  assert(exp.count() >= 3, 'fn requires params and body')
  const argSpec = exp.get(1)
  const body = exp.slice(2)
  const fnEnv = 'fnEnv'
  let bindText = ''
  if (lang.isSym(argSpec)) {
    bindText = `${fnEnv} = ${fnEnv}.set(lang.sym(${q(argSpec.sym)}), args);`
  } else {
    let n = 0
    const nextTemp = (prefix = 'arg') => `__fn_${prefix}${n++}`
    bindText = emitBindPattern(argSpec, 'args', fnEnv, nextTemp)
  }
  const bodyExpr = body.size === 1
    ? emitAstExpr(body.first(), fnEnv)
    : emitDo(lang.makeForm('do', ...body), fnEnv)
  return `(args) => { let ${fnEnv} = ${envName}; ${bindText} return ${bodyExpr}; }`
}

const emitDo = (exp, envName) => {
  assert(lang.isForm(exp, 'do'), 'do form expected')
  const xs = exp.rest().toArray()
  if (xs.length === 0) {
    return 'undefined'
  }
  if (xs.length === 1) {
    return emitAstExpr(xs[0], envName)
  }
  const lines = xs
    .slice(0, -1)
    .map(x => `${emitAstExpr(x, envName)};`)
    .join(' ')
  return `(() => { ${lines} return ${emitAstExpr(xs[xs.length - 1], envName)}; })()`
}

/** `(expand x)` → `env.get(key)` where key is the evaluated atom (sym, literal, or expression). */
const emitExpand = (exp, envName) => {
  assert(lang.isForm(exp, 'expand'), 'expand form expected')
  assert(exp.count() >= 2, 'expand expects an argument')
  const inner = exp.get(1)
  if (lang.isSym(inner)) {
    return `${envName}.get(lang.sym(${q(inner.sym)}))`
  }
  return `${envName}.get(${emitAstExpr(inner, envName)})`
}

const emitIf = (exp, envName) => {
  assert(lang.isForm(exp, 'if'), 'if form expected')
  assert(exp.count() >= 4, 'if expects test, then, and else branches')
  const test = emitAstExpr(exp.get(1), envName)
  const thenB = emitAstExpr(exp.get(2), envName)
  const elseB = emitAstExpr(exp.get(3), envName)
  return `(${test} ? ${thenB} : ${elseB})`
}

const emitQuotedListShape = (exp) => {
  const rest = exp.rest().toArray()
  if (rest.length === 0) {
    return 'lang.makeList()'
  }
  return `lang.makeList(${rest.map(emitQuotedDatum).join(', ')})`
}

const emitQuotedSetShape = (exp) => {
  const rest = exp.rest().toArray()
  if (rest.length === 0) {
    return 'lang.makeSet()'
  }
  return `lang.makeSet(${rest
    .map(v => `[${emitQuotedDatum(v)},${emitQuotedDatum(v)}]`)
    .join(', ')})`
}

const emitQuotedImplicitList = (exp) =>
  exp.count() === 0
    ? 'lang.makeList()'
    : `lang.makeList(${exp.map(emitQuotedDatum).toArray().join(', ')})`

const emitQuotedDatum = (exp) => {
  if (lang.isSym(exp)) {
    return `lang.sym(${q(exp.sym)})`
  }
  if (lang.isList(exp)) {
    if (lang.isForm(exp, 'list')) return emitQuotedListShape(exp)
    if (lang.isForm(exp, 'set')) return emitQuotedSetShape(exp)
    return emitQuotedImplicitList(exp)
  }
  if (lang.isSet(exp)) {
    emitFail(`quoted value cannot be a set map (${lang.getType(exp)})`)
  }
  return emitLiteral(exp)
}

const emitQuote = (exp, _envName) => {
  assert(lang.isForm(exp, 'quote'), 'quote form expected')
  assert(exp.count() >= 2, 'quote expects an argument')
  return emitQuotedDatum(exp.get(1))
}

const emitConjNoSpread = (emptyExpr, parts, envName) => {
  const em = parts.map(p => emitAstExpr(p, envName)).join(', ')
  return `lang.conj(${emptyExpr}, ${em})`
}

const emitConjSpreadBody = (emptyExpr, parts, envName) => {
  const stmts = [`let col = ${emptyExpr};`]
  let si = 0
  for (const p of parts) {
    if (lang.isForm(p, 'spread')) {
      const tmp = `__s${si++}`
      stmts.push(`const ${tmp} = ${emitAstExpr(p.get(1), envName)};`)
      stmts.push(
        `col = lang.isList(${tmp})` +
          ` ? ${tmp}.reduce((c, v) => lang.conj(c, v), col)` +
          ` : ${tmp}.reduce((c, v, k) => lang.conj(c, lang.makeForm('bind', k, v)), col);`
      )
    } else {
      stmts.push(`col = lang.conj(col, ${emitAstExpr(p, envName)});`)
    }
  }
  stmts.push('return col;')
  return `(() => { ${stmts.join(' ')} })()`
}

const emitConjParts = (emptyExpr, parts, envName) =>
  parts.length === 0
    ? emptyExpr
    : parts.some(p => lang.isForm(p, 'spread'))
      ? emitConjSpreadBody(emptyExpr, parts, envName)
      : emitConjNoSpread(emptyExpr, parts, envName)

const emitListLiteral = (exp, envName) => {
  assert(lang.isForm(exp, 'list'), 'list literal form expected')
  return emitConjParts('lang.makeList()', exp.rest().toArray(), envName)
}

const emitSetLiteral = (exp, envName) => {
  assert(lang.isForm(exp, 'set'), 'set literal form expected')
  return emitConjParts('lang.makeSet()', exp.rest().toArray(), envName)
}

const emitAstListExpr = (exp, envName) => {
  if (lang.isForm(exp, 'if')) return emitIf(exp, envName)
  if (lang.isForm(exp, 'quote')) return emitQuote(exp, envName)
  if (lang.isForm(exp, 'list')) return emitListLiteral(exp, envName)
  if (lang.isForm(exp, 'set')) return emitSetLiteral(exp, envName)
  if (lang.isForm(exp, 'label')) return emitLabel(exp, envName)
  if (lang.isForm(exp, 'fn')) return emitFn(exp, envName)
  if (lang.isForm(exp, 'do')) return emitDo(exp, envName)
  if (lang.isForm(exp, 'expand')) return emitExpand(exp, envName)
  return emitCall(exp, envName)
}

export const emitAstExpr = (exp, envName = 'env') => {
  if (lang.isSym(exp)) {
    return emitSym(exp, envName)
  }
  if (lang.isList(exp)) {
    return emitAstListExpr(exp, envName)
  }
  return emitLiteral(exp)
}

export const emitAstResult = (exp, resultSym = 'result', envName = 'env') =>
  `${envName} = ${envName}.set(lang.sym(${q(resultSym)}), ${emitAstExpr(exp, envName)})`

// Backward-compatible aliases.
export const emitExpr = emitAstExpr
export const emitResult = emitAstResult

export const emitSourceExpr = (src, envName = 'env') =>
  emitAstExpr(read(src).first(), envName)
