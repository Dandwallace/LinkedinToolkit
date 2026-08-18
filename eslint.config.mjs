import globals from 'globals';
import react from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';

/**
 * A deliberately small lint config.
 *
 * Its whole job is to catch the one class of bug that `next build` cannot:
 * a free identifier. `savedKey(b)` with no import compiles perfectly, ships,
 * and only fails when somebody presses the button. That has now happened
 * three times in the intake form alone, each time found by a person clicking
 * rather than by the build.
 *
 * There are no style rules here on purpose. Formatting arguments are not
 * worth a red build; a Save button that throws is.
 */
export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
  {
    files: ['**/*.js', '**/*.jsx', '**/*.mjs'],
    /* exhaustive-deps is off, so the disable comments written for it read as
     * unused. They document why an effect omits a dependency and should
     * survive the rule being switched back on. */
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { react, 'react-hooks': hooks },
    rules: {
      'no-undef': 'error',
      /* A hook called conditionally corrupts React's state ordering, which
       * surfaces as a component rendering someone else's data. */
      'react-hooks/rules-of-hooks': 'error',
      /* Off deliberately. The effects here that omit a dependency do so on
       * purpose, and the file already carries disable comments saying so;
       * the plugin is loaded partly so those comments resolve. */
      'react-hooks/exhaustive-deps': 'off',
      /* Marks components referenced in JSX as used, so an imported <Nav />
       * is not reported as dead. */
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      /* An unused local is usually the other half of a half-finished edit,
       * which is how the last two of these bugs were introduced. A warning,
       * not an error: it should be visible without stopping a deploy. */
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
    },
  },
];
