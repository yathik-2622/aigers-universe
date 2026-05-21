/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Geist"', '"Manrope"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        panel: 'rgb(var(--color-panel) / <alpha-value>)',
        elev: 'rgb(var(--color-elev) / <alpha-value>)',
        line: 'rgb(var(--color-line) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        accent2: 'rgb(var(--color-accent2) / <alpha-value>)',
        ok: 'rgb(var(--color-ok) / <alpha-value>)',
        warn: 'rgb(var(--color-warn) / <alpha-value>)',
        bad: 'rgb(var(--color-bad) / <alpha-value>)',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(124,92,255,0.4), 0 12px 32px -8px rgba(124,92,255,0.35)',
      },
    },
  },
  plugins: [],
}
