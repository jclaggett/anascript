# Anascript Cursor/VS Code Syntax Extension

This folder contains a minimal TextMate grammar extension for `.ana` files.

## Local install in Cursor

1. Install the VS Code packaging tool if needed:
   - `npm i -g @vscode/vsce`
2. From this directory:
   - `vsce package`
3. In Cursor:
   - Extensions -> `...` menu -> Install from VSIX...
   - Select the generated `.vsix`

## Scope

The grammar highlights comments, strings, constants, numbers, symbols, keywords,
sigils/operators, and delimiters. It is intentionally small and easy to tune.
