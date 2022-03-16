# Labeled, Structure Notation

A notation for expressing data structures and is a superset of JSON. The novel
idea is to generalize the concept of a 'label' found in JSON objects to be
available in all data structures. The goal is to define a Lisp based
configuration language that would act as a JSON+ option. Kind of like YAML but
going in a lisp direction and not towards significant whitespace.

See the EBNF grammar for specifics on syntax: `src/lsn.ebnf.w3c`.

This is still just an crude experiment at the moment.

to try it out: `bin/lsn.js`

# A Brief tour of LSN syntax and semantics

## Simple Values
_TODO_

## Labels

Labels in LSN are represented by using an infix colon between two values in a
collection:
```
ex1: [
  a: 42
  b: a # "Labels in an ordered collection are lexically scoped."
]

ex2: {
  "a:" 42
}

b: (get ex2 "a") # "Labels in an unordered collection are dynamically scoped."
```

## Collection Values
_TODO_

##  Comments
_TODO_

# Notes

I see the label syntax as additional syntax added onto Clojure and Lisp:
1. Classic Lisp: Code and data collections are represented using parens.
2. Clojure: Square brackets (vectors) and curly brackets (maps) are added and
   describe ordered and unordered data collections. Parens (lists) now usually
   mean code.
3. LSN: labels are added and describe dynamic and lexical bindings in unordered
   and ordered data collections.

Ideally, I like the simplicity of S-Expressions in Lisp. Practically, I like
the semantic meaning of square and curly brackets and I view labels as another
(hopefully practical) concession of adding more syntax to Lisp. An interesting
benefit of adding label syntax is that JSON is now a proper subset of LSN.

Various other design goals:
- structural syntex only (e.g., no line based comments)
- small syntax (see `src/lsn.ebnf.w3c`) 
- No specific semantic meaning attached to `()`, `[]`, or `{}` They are all
  grouping forms.
- Limit in-fix syntax to labels and nothing else.
