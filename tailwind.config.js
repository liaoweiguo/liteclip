/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f6f7fb",
          100: "#eceef5",
          200: "#d5d9e6",
          300: "#b0b7cd",
          400: "#868fae",
          500: "#666f92",
          600: "#515878",
          700: "#424863",
          800: "#393e53",
          900: "#323648",
          950: "#1e2130",
        },
        brand: {
          50: "#eef7ff",
          100: "#d9edff",
          200: "#bce0ff",
          300: "#8ecdff",
          400: "#59b0ff",
          500: "#328eff",
          600: "#1b6ef5",
          700: "#1457e1",
          800: "#1747b6",
          900: "#193f8f",
          950: "#142857",
        },
        accent: {
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
        },
        warn: {
          400: "#fbbf24",
          500: "#f59e0b",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "PingFang SC",
          "Segoe UI",
          "Microsoft YaHei",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,.04), 0 4px 16px rgba(15,23,42,.06)",
        pop: "0 8px 32px rgba(15,23,42,.10)",
      },
      borderRadius: {
        xl2: "14px",
      },
    },
  },
  plugins: [],
};
