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
        gold: '#FFD23F',
        'gold-light': '#FFE07A',
        violet: '#8B5CF6',
        cyan: '#38E1C8',
        coral: '#FF6B5B',
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
