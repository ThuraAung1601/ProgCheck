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
          primary:  'var(--bg-primary)',
          secondary:'var(--bg-secondary)',
          surface:  'var(--bg-surface)',
          elevated: 'var(--bg-elevated)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          accent: 'var(--border-accent)',
        },
        txt: {
          primary:   'var(--txt-primary)',
          secondary: 'var(--txt-secondary)',
          tertiary:  'var(--txt-tertiary)',
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
