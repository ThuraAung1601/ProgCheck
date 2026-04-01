/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        sans: ['"DM Sans"', 'sans-serif'],
      },
      colors: {
        bg: {
          primary:  '#0d0f14',
          secondary:'#131620',
          surface:  '#181c26',
          elevated: '#1e2332',
        },
        border: {
          subtle: 'rgba(255,255,255,0.07)',
          accent: 'rgba(255,255,255,0.12)',
        },
        txt: {
          primary:   '#e2e4ec',
          secondary: '#8892a4',
          tertiary:  '#505968',
        },
        accent: {
          blue:  '#3B8BD4',
          green: '#639922',
          amber: '#BA7517',
          pink:  '#993556',
        },
        trace: {
          success: '#22c55e',
          fail:    '#ef4444',
          cut:     '#f59e0b',
          ghost:   '#6366f1',
        },
      },
    },
  },
  plugins: [],
};
