module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true
  },
  extends: [
    'eslint:recommended',
    'plugin:jest/recommended'
  ],
  plugins: [
    'jest'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    'indent': ['error', 2],
    'linebreak-style': ['error', 'unix'],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],
    'no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
    'no-console': 'warn',
    'no-debugger': 'error',
    'no-trailing-spaces': 'error',
    'eol-last': 'error',
    'comma-dangle': ['error', 'never'],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],
    'space-before-function-paren': ['error', 'never'],
    'keyword-spacing': 'error',
    'space-infix-ops': 'error',
    'no-multiple-empty-lines': ['error', { 'max': 2 }],
    'jest/no-disabled-tests': 'warn',
    'jest/no-focused-tests': 'error',
    'jest/no-identical-title': 'error',
    'jest/prefer-to-have-length': 'warn',
    'jest/valid-expect': 'error'
  },
  overrides: [
    {
      files: ['tests/**/*.js'],
      rules: {
        'no-console': 'off'
      }
    }
  ]
};
