import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#101316",
        panel: "#171b20",
        surface: "#f4f6f7",
        line: "#dbe2e5",
        accent: "#1f8a70",
        amber: "#c47a24",
      },
      boxShadow: {
        soft: "0 18px 60px rgba(16, 19, 22, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
