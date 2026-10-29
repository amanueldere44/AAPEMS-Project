
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          800: '#183b52',
          900: '#123047',
          950: '#0b1f2d',
        },
        gold: {
          400: '#e9bd59',
          500: '#d6a83f',
        },
      },
      boxShadow: {
        panel: '0 4px 18px rgba(15, 23, 42, 0.06)',
      },
    },
  },
  plugins: [],
};
