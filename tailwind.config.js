/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        cardinal: "#A31F36"
      },
      fontFamily: {
        poppins: ['"Poppins"', 'sans-serif']
      }
    }
  },
  plugins: []
};
