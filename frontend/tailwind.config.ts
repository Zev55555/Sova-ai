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
        ink: "#f4f7fb",
        panel: "#111318",
        surface: "#080a0f",
        line: "rgba(255,255,255,0.08)",
        accent: "#67e8f9",
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
