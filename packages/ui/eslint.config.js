import react from '@bv/config/eslint/react';

export default [
  // theme-init.js es un script vanilla que corre antes de React (anti-FOUC),
  // vendoreado de v1: queda fuera del lint tipado.
  { ignores: ['src/theme-init.js'] },
  ...react,
];
