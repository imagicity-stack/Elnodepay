/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        cardinal: "#A31F36",
        portal: {
          DEFAULT: "#5C6CFF",
          dark: "#162041",
          muted: "#E4E9FF"
        }
      },
      fontFamily: {
        poppins: ['"Poppins"', 'sans-serif']
      }
    }
  },
  plugins: []
};
