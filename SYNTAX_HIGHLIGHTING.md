# Anascript Syntax Highlighting Scaffold

This repo now includes starter scaffolds for both Cursor/VS Code and Neovim paths.

## Cursor / VS Code (TextMate extension)

Path: `tools/cursor-anascript-syntax`

- Language id: `anascript`
- File extension: `.ana`
- Grammar: `syntaxes/anascript.tmLanguage.json`

Install locally by packaging the extension (`vsce package`) and installing the VSIX in Cursor.

## Neovim (Tree-sitter)

Path: `tools/tree-sitter-anascript`

- Grammar entry: `grammar.js`
- Highlights query: `queries/highlights.scm`

Use `tree-sitter generate` to produce parser artifacts, then wire parser + queries in Neovim.

## Next improvements

1. Align Tree-sitter grammar rules more closely with `src/grammar.ebnf`.
2. Add grammar fixtures/tests for edge cases (`label`, spreads, negative sets, escaped symbols).
3. Keep token naming between TextMate and Tree-sitter reasonably consistent for theme quality.
