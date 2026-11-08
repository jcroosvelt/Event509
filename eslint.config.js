import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'playwright-report', 'test-results'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, jsxA11y.flatConfigs.recommended],
    languageOptions: { globals: { ...globals.browser }, ecmaVersion: 2022 },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Les étiquettes de formulaire sont reliées par <Field> (htmlFor/id via contexte)
      'jsx-a11y/label-has-associated-control': 'off',
      // Le focus initial des fenêtres est géré explicitement (bouton Fermer du tiroir)
      'jsx-a11y/no-autofocus': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.{js,ts}', 'e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
);
