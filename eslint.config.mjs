import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', '.eslintrc.js', 'jest.config.js', 'src/types/generated/**']
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module'
      },
      globals: {
        ...globals.node
      }
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'prettier': prettierPlugin,
      'import': importPlugin
    },
    rules: {
      'import/extensions': 0,
      'import/prefer-default-export': 0,
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': ['error'],
      'import/named': 0,
      'import/no-named-as-default': 0,
      'import/no-named-as-default-member': 0,
      'import/no-cycle': 0,
    },
    settings: {
      'import/extensions': ['.js', '.ts'],
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts']
      },
      'import/resolver': {
        node: {
          extensions: ['.js', '.ts']
        }
      }
    }
  }
];
