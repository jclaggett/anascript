import path from 'path'
import { fileURLToPath } from 'url'

import js from '@eslint/js'
import globals from 'globals'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended
})

export default [
  {
    ignores: ['node_modules/**', 'coverage/**']
  },
  ...compat.extends('standard'),
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    },
    rules: {
      complexity: ['error', { max: 15 }],
      'max-depth': ['error', { max: 4 }],
      'max-lines-per-function': ['error', { max: 100, skipBlankLines: true, skipComments: true }],
      'max-nested-callbacks': ['error', { max: 3 }],
      'max-statements': ['error', { max: 15 }],
      'no-constant-condition': ['error', { checkLoops: false }]
    }
  },
  ...compat.extends('plugin:jest/recommended').map(config => ({
    ...config,
    files: ['**/__tests__/*'],
    languageOptions: {
      ...(config.languageOptions ?? {}),
      globals: {
        ...(config.languageOptions?.globals ?? {}),
        ...globals.jest
      }
    },
    rules: {
      ...(config.rules ?? {}),
      'max-lines-per-function': 'off',
      'max-statements': 'off'
    }
  }))
]
