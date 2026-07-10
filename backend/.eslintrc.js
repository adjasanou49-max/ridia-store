module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', ignoreRestSiblings: true },
    ],
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    // Requis pour l'augmentation de types Express (declare global { namespace Express {...} }) -
    // seule syntaxe possible pour ce pattern standard, pas un vrai problème de code.
    '@typescript-eslint/no-namespace': 'off',
    'no-console': 'off',
  },
  ignorePatterns: ['dist', 'node_modules', '*.test.ts'],
};
