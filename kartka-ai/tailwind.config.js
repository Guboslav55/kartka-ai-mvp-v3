/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        gold: '#c8a84b',
        'gold-light': '#e8c96a',
        navy: '#1a3a5c',
        'navy-mid': '#2456a4',
      },
      fontFamily: {
        sans: ['var(--font-golos)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
