import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Entry animations for rows/columns/tooltips. No `forwards` fill, so
      // once finished the element has no lingering transform (a transform
      // would make it the containing block for position:fixed descendants).
      keyframes: {
        "row-in": {
          from: { opacity: "0", transform: "translateY(-6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "tooltip-in": {
          from: { opacity: "0", transform: "translate(-50%, 2px) scale(0.95)" },
          to: { opacity: "1", transform: "translate(-50%, 0) scale(1)" },
        },
      },
      animation: {
        "row-in": "row-in 220ms ease-out",
        "fade-in": "fade-in 250ms ease-out",
        "tooltip-in": "tooltip-in 120ms ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
