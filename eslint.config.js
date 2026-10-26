export default [
  {
    files: ['src/**/*.js', 'tests/**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: { 'no-unused-vars': 'warn', 'no-console': 'off' }
  }
];
