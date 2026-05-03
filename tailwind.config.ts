import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#09090b', 2: '#0f0f13', 3: '#15151a', 4: '#1c1c23' },
        surface: { DEFAULT: '#1e1e26', hover: '#24242e' },
        border: { DEFAULT: '#1e1e2a', 2: '#2a2a3a', active: '#3a3a4e' },
        t: { 1: '#fafafa', 2: '#a1a1aa', 3: '#71717a', 4: '#52525b' },
        accent: { DEFAULT: '#10b981', light: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.24)' },
        danger: { DEFAULT: '#ef4444', light: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.24)' },
        info: { DEFAULT: '#3b82f6', light: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.24)' },
        warning: { DEFAULT: '#f59e0b', light: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.24)' },
        purple: { DEFAULT: '#8b5cf6', light: 'rgba(139,92,246,0.1)' },
        cyan: { DEFAULT: '#06b6d4', light: 'rgba(6,182,212,0.1)' },
        pink: { DEFAULT: '#ec4899', light: 'rgba(236,72,153,0.1)' },
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
      boxShadow: {
        sm: '0 1px 2px rgba(0,0,0,0.3)',
        md: '0 4px 12px rgba(0,0,0,0.4)',
        lg: '0 8px 24px rgba(0,0,0,0.5)',
        xl: '0 20px 50px rgba(0,0,0,0.6)',
        glow: '0 0 24px rgba(16,185,129,0.18)',
        'glow-sm': '0 0 12px rgba(16,185,129,0.12)',
        'inset-border': 'inset 0 1px 0 rgba(255,255,255,0.04)',
      },
      animation: {
        'fade-up': 'fadeUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in': 'fadeIn 0.25s ease-out forwards',
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
