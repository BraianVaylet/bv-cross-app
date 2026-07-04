import reactHooks from 'eslint-plugin-react-hooks';
import base from './base.js';

/** Config para frontends React (apps/cross, apps/schedule, apps/crm, packages/ui). */
export default [
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
