/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#10231f",
        fern: "#22745e",
        brass: "#c28a3a",
        paper: "#f7f8f5",
        clay: "#b45742",
        plum: "#6f4c7a",
      },
      boxShadow: {
        soft: "0 18px 60px rgba(16, 35, 31, 0.11)",
      },
    },
  },
  plugins: [],
};
