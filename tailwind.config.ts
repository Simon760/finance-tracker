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
        t: { 1: '#fafafa', 2: '#a1a1aa', 3: '#52525b', 4: '#3f3f46' },
        accent: { DEFAULT: '#10b981', light: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.24)' },
        danger: { DEFAULT: '#ef4444', light: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.24)' },
        info: { DEFAULT: '#3b82f6', light: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.24)' },
        warning: { DEFAULT: '#f59e0b', light: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.24)' },
        purple: { DEFAULT: '#8b5cf6', light: 'rgba(139,92,246,0.1)' },
        cyan: { DEFAULT: '#06b6d4', light: 'rgba(6,182,212,0.1)' },
        pink: { DEFAULT: '#ec4899', light: 'rgba(236,72,153,0.1)' },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0,0,0,0.3)',
        md: '0 4px 12px rgba(0,0,0,0.4)',
        lg: '0 8px 24px rgba(0,0,0,0.5)',
        glow: '0 0 20px rgba(16,185,129,0.08)',
      },
      animation: {
        'fade-up': 'fadeUp 0.25s ease-out forwards',
        'pulse-slow': 'pulse 2s infinite',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
