; Delimiters
[
  "("
  ")"
  "["
  "]"
  "{"
  "}"
] @punctuation.bracket

; Literals and constants
(string) @string
(number) @number
(boolean) @boolean
(null) @constant.builtin
(undefined) @constant.builtin
(comment) @comment

; Sigils
(expand "$" @operator)
(quote "\\" @operator)

; Symbols
(symbol) @variable

; Highlight common special forms when first item in a list
(list
  "("
  (symbol) @keyword
  (#any-of? @keyword "if" "do" "fn" "let" "eval" "eval2" "label" "quote" "expand" "spread" "conj" "list" "set")
)
