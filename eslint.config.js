import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    rules: {
      // Error Prevention
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off', // Allow console for debugging
      'no-debugger': 'warn',
      'no-constant-condition': ['error', { checkLoops: false }],

      // Best Practices
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'warn',
      'prefer-arrow-callback': 'warn',
      'no-param-reassign': 'off', // Common in audio processing

      // Code Style (will be handled by Prettier)
      'quotes': 'off',
      'semi': 'off',
      'indent': 'off',
      'comma-dangle': 'off',

      // Async/Await
      'require-await': 'warn',
      'no-async-promise-executor': 'error',

      // Modern JS
      'prefer-template': 'warn',
      'prefer-rest-params': 'warn',
      'prefer-spread': 'warn',

      // Potential Bugs
      'no-await-in-loop': 'off', // Sometimes needed for sequential operations
      'no-promise-executor-return': 'error',
      'no-unreachable-loop': 'error',
    },
  },
  {
    // Specific overrides for main.js (large file with many functions)
    files: ['src/main.js'],
    rules: {
      'no-unused-vars': 'off', // Too many to fix in one go
    },
  },
  {
    // Ignore patterns
    ignores: [
      'node_modules/',
      'dist/',
      'aux/',
      'rdf/',
      '*.min.js',
      'docs_landing.html',
      'index_backup_*.html',
    ],
  },
];
