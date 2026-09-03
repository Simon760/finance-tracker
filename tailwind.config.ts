import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Tous les tokens pointent sur des variables CSS définies dans globals.css
      // (:root = sombre, [data-theme="light"] = clair). La forme
      // rgb(var(--x) / <alpha-value>) est OBLIGATOIRE : c'est elle qui laisse
      // fonctionner les modificateurs d'opacité (bg-accent/10, border-danger/25…),
      // très utilisés dans le code. Un hex ou un rgb() figé les casserait.
      colors: {
        bg: {
          DEFAULT: 'rgb(var(--bg) / <alpha-value>)',
          2: 'rgb(var(--bg-2) / <alpha-value>)',
          3: 'rgb(var(--bg-3) / <alpha-value>)',
          4: 'rgb(var(--bg-4) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          hover: 'rgb(var(--surface-hover) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          2: 'rgb(var(--border-2) / <alpha-value>)',
          active: 'rgb(var(--border-active) / <alpha-value>)',
        },
        t: {
          1: 'rgb(var(--t-1) / <alpha-value>)',
          2: 'rgb(var(--t-2) / <alpha-value>)',
          3: 'rgb(var(--t-3) / <alpha-value>)',
          4: 'rgb(var(--t-4) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          light: 'rgb(var(--accent) / 0.1)',
          border: 'rgb(var(--accent) / 0.24)',
        },
        danger: {
          DEFAULT: 'rgb(var(--danger) / <alpha-value>)',
          light: 'rgb(var(--danger) / 0.1)',
          border: 'rgb(var(--danger) / 0.24)',
        },
        info: {
          DEFAULT: 'rgb(var(--info) / <alpha-value>)',
          light: 'rgb(var(--info) / 0.1)',
          border: 'rgb(var(--info) / 0.24)',
        },
        warning: {
          DEFAULT: 'rgb(var(--warning) / <alpha-value>)',
          light: 'rgb(var(--warning) / 0.1)',
          border: 'rgb(var(--warning) / 0.24)',
        },
        purple: { DEFAULT: 'rgb(var(--purple) / <alpha-value>)', light: 'rgb(var(--purple) / 0.1)' },
        cyan: { DEFAULT: 'rgb(var(--cyan) / <alpha-value>)', light: 'rgb(var(--cyan) / 0.1)' },
        pink: { DEFAULT: 'rgb(var(--pink) / <alpha-value>)', light: 'rgb(var(--pink) / 0.1)' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
      },
      // Ombres également tokenisées : les noirs à 40-60 % du mode sombre sont
      // beaucoup trop lourds sur fond clair.
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
        glow: '0 0 24px rgb(var(--accent) / 0.18)',
        'glow-sm': '0 0 12px rgb(var(--accent) / 0.12)',
        'inset-border': 'var(--shadow-inset-border)',
      },
      animation: {
        'fade-up': 'fadeUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in': 'fadeIn 0.25s ease-out forwards',
        'slide-up': 'slideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'pulse-slow': 'pulseSoft 2.4s ease-in-out infinite',
        'shimmer': 'shimmer 2.4s linear infinite',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      letterSpacing: {
        tightest: '-0.04em',
        ultra: '-0.06em',
      },
    },
  },
  plugins: [],
};
export default config;
