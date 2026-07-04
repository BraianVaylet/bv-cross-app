import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';

/**
 * Config base para todo paquete TypeScript del monorepo (docs/03-tecnico.md #7).
 * Requiere que el paquete consumidor tenga su tsconfig (projectService lo detecta).
 */
export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', '*.config.*'] },
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      'import-x': importX,
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Los literales en templates son comunes y seguros (ids, numeros)
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'import-x/no-cycle': 'error',
    },
  },
);
