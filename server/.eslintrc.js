module.exports = {
  env: {
    browser: false,
    es2021: true,
    node: true,
    jest: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    'max-classes-per-file': ['error', 15], // 允许更多类
    'no-plusplus': 'off', // 允许使用++操作符
    'func-names': 'off', // 允许匿名函数
    'no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }], // 忽略以_开头的未使用参数
    'no-param-reassign': ['error', { 'props': false }], // 允许修改参数属性
    'prefer-destructuring': 'off', // 关闭解构赋值要求
    'no-console': 'warn',
    'indent': ['error', 2],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always']
  }
};