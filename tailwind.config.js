/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans Variable"', 'system-ui', 'sans-serif'] },
      colors: {
        ink: { DEFAULT: '#0B1533', soft: '#4A5573', muted: '#8A93AB' },
        brand: { DEFAULT: '#1F5EFF', dark: '#0F44D6', 50: '#EEF3FF', 100: '#DCE7FF', 200: '#BFD2FF', 300: '#93B3FF' },
        canvas: '#F1F3F8',
        line: '#E6E9F2',
      },
      borderRadius: { '4xl': '2rem' },
      boxShadow: {
        card: '0 1px 2px rgba(11,21,51,0.04), 0 8px 24px -12px rgba(11,21,51,0.08)',
        float: '0 12px 30px -8px rgba(31,94,255,0.55)',
      },
    },
  },
  plugins: [],
};
