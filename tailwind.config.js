/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/**/*.{html,js}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: '#e2e8f0',
        panel: '#0f172a',
        accent: '#2dd4bf',
        ember: '#f59e0b',
        rose: '#fb7185',
      },
      boxShadow: {
        glow: '0 24px 80px rgba(15, 23, 42, 0.45)',
      },
    },
  },
  plugins: [],
};
