# tree-sitter-anascript

Starter Tree-sitter grammar scaffold for Anascript.

## Generate parser artifacts

From this directory:

1. Install deps: `npm install`
2. Generate parser files: `npm run generate`
3. Run parser tests (add fixtures first): `npm test`

## Notes

- This grammar is intentionally minimal to bootstrap syntax highlighting and editor integration.
- It should be evolved toward full language coverage based on `src/grammar.ebnf`.
- Highlight captures live in `queries/highlights.scm` for Neovim and other Tree-sitter clients.
