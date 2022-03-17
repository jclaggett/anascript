# Labeled, Structured Notation

A notation for expressing data structures and is a superset of JSON. The novel
idea is to generalize the concept of a 'label' found in JSON objects using a
`:` (e.g., `"label": true`) to be made available in all data structures. The
goal is to define a Lisp based configuration language that would act as a JSON+
option.  Kind of like YAML but going in a lisp direction and definitely not
towards significant whitespace.

Ideally, I like the simplicity of S-Expressions in Lisp. Practically, I like
the semantic meaning of square and curly brackets and I view labels as another
(hopefully practical) concession of adding a little more syntax to Lisp. This
is the last time we'd need to add syntax I promise!

An interesting benefit of adding `:` labeling syntax is that JSON is a proper
subset of LSN. Also like YAML.

See the EBNF grammar for specifics on syntax: `src/lsn.ebnf.w3c`.

This is still just an crude experiment at the moment.

## LSN Design Notes

1. Labels are additional syntax layered on top of Clojure and Lisp:
  - Classic Lisp: Code and data collections are represented using lists
    (parens only).
  - Clojure: Square brackets (vectors) and curly brackets (maps, sets) are
    added and describe ordered and unordered data collections. Parens (lists)
    now usually mean code.
  - LSN: labels are added with an infix `:`. Describe bindings in various
    paren, square and curly bracket collections.
2. The `:` form may occur anywhere.
3. The `:` is the _only_ infix syntax to be added. Having only one infix
   syntax means the precendence rules will not be _too_ horrible.
4. A few symbols will be dedicated for use in prefix syntax:
  - `#` which more loosely binds to the next form (e.g., in `#a:1` the `#`
     applies to the entire `a:1` form).
  - `$`, `\` which both tightly bind to the next form (e.g., in `$a:1` the `$`
     applies only to the `a`).
5. Prefix symbols are not allowed to appear as a part of other symbols
6. Symbols may occur anywhere.
7. Strings just support `"` delimiters.
8. No sigificant whitespace. None. Not even comment lines.
9. Commas and semicolons are just whitespace.
10. Trying to be easy to parse by humans Syntax by being small and not having
   exceptions if possible.

# Labeled, Structured Lisp

As a way of thinking about LSN above, I created a toy Lisp that adds a layer of
semantics around the syntax. This lisp was heavily influenced by Joel Martin's
MAL project: https://github.com/kanaka/mal

To run an LSL repl, run this command: `npm run start`

## A Brief tour of LSL syntax and semantics

### Simple Values

    #"comment string" #"Does nothing"
    1, -30.1          #"numbers (comma is whitespace)"
    true false        #"boolean values"
    "a" "b"           #"strings"
    null undefined    #"null & undefined"
    \symbol           #"symbol literal (using \ syntax)"
    #23               #"number commented out"

### Labeled Values

    x: 3              #"number labeled with symbol x"
    $x                #"symbol x expanded to 3"
    x                 #"symbols expand automatically"
    34: true          #"true labeled with number 34"
    $34               #"number 34 expanded to true"
    a: b: 3.14        #"labels can be chained"

### Compound Values

    [1 2 3 4]         #"ordered collection (vector)"
    {1 2 3 4}         #"unordered collection (set)"
    {a:1 b:2}         #"unordered, labeled collection (map)"
    {a:1 3 4}         #"unordered, partially labeled collection (map & set)"
    [a:1 b:2]         #"vector of labeled values"

### Function Calls

    v: (+ 1 2)        #"+ function sums numbers"
    (- 9 v)           #"- function subtracts them"
    (conj {1 2} 3)    #"conj adds values to unordered collections"
    (conj [1 2] 3)    #"or to the end of ordered collections (NOT DONE)"
    z: (conj {1} b:2) #"conj also adds labeled values"
    (get z \b)        #"get will look up values by their labels"
    (get z 1)         #"unlabeled values are implicitly labeled as themselves."
    (get [-1 -2] 1)   #"ordered collections have implicit index labels"
    (get [1 x:2] \x)  #"and may also have explicit labels (NOT DONE)"

## LSL Design Notes
1. Each syntax corresponds to exactly one lisp special form. This means parsing
   the syntax is just the process of replacing the syntax with the following
   forms:

| Syntax | Lisp Form |
| --- | --- |
| `#x` | `(comment x)` |
| `x:1` | `(bind x 1)` |
| `$x` | `(expand x)` |
| `\x` | `(quote x)` |
| `[x y z]` | `(list x y z)` |
| `{x y z}` | `(set x y z)` |
| `(x y z)` | `(x y z)` |

2. Only two kinds of collections: ordered (lists) and unordered (sets).
   Maps are a special case of sets. Parens are a special case of lists.
3. Symbols are expanded (resolved) everywhere _except_ in the left hand side of
   a bind.
4. No keywords. Since symbols are conviently not expanded in a bind form, maybe
   we don't need them.
