import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1C1F26",
        rail: "#23262E",
        paper: "#F7F7F5",
        line: "#E3E4E0",
        accent: "#1F5FBF",
        accentSoft: "#E7EEFB",
        good: "#2E7D4F",
        warn: "#B8860B",
        bad: "#B23B3B",
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
    },
  },
  plugins: [require("@tailwindcss/typography")],
} satisfies Config;
