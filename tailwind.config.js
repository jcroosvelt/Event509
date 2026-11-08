/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans Variable"', 'system-ui', 'sans-serif'] },
      colors: {
        // Couleurs sémantiques : elles s'inversent en mode sombre (voir index.css)
        ink: { DEFAULT: v('ink'), soft: v('ink-soft'), muted: v('ink-muted') },
        canvas: v('canvas'),
        surface: v('surface'),
        line: v('line'),
        contrast: v('contrast'),
        'on-contrast': v('on-contrast'),
        brand: {
          DEFAULT: v('brand'),
          ink: v('brand-ink'),
          dark: v('brand-dark'),
          50: v('brand-50'),
          100: v('brand-100'),
          200: v('brand-200'),
          300: v('brand-300'),
        },
        // Bleu nuit du logo, identique dans les deux thèmes (panneaux de marque, voiles sur images)
        navy: '#0B1533',
      },
      borderRadius: { '4xl': '2rem' },
      boxShadow: {
        card: 'var(--shadow-card)',
        float: '0 12px 30px -8px rgba(31,94,255,0.55)',
      },
    },
  },
  plugins: [],
};
