/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fbf7ee',
          100: '#f5ecd6',
          200: '#edd9ac',
          500: '#c28728',
          600: '#a66e1e',
          700: '#84511b',
          900: '#462710',
        },
      },
    },
  },
  plugins: [],
};

