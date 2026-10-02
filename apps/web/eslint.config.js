import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const deepFeatureImport = { regex: '^@/features/[^/]+/.+', message: 'Import another feature only through its index: @/features/<name>.' }

function featureBoundary(depth) {
  const parents = '(\\.\\./)'.repeat(depth)
  return {
    files: [`src/features/*/${'*/'.repeat(depth - 1)}*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ regex: `^${parents}`, message: 'Leave a feature through @/shared or @/features/<name>, not relative paths.' }, deepFeatureImport] }],
    },
  }
}

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['src/app/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [deepFeatureImport] }] },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}', 'src/config/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [{ regex: '^(@/features|(\\.\\./)+features)', message: 'Shared code must not depend on features.' }] }] },
  },
  ...[1, 2, 3, 4].map(featureBoundary),
])
