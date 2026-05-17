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
        bg: '#0a0a0f',
        panel: '#11111a',
        elev: '#161623',
        line: '#1f1f33',
        ink: '#e9e9f7',
        muted: '#7c7c95',
        accent: '#7c5cff',
        accent2: '#22d3ee',
        ok: '#22c55e',
        warn: '#f59e0b',
        bad: '#ef4444',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(124,92,255,0.4), 0 12px 32px -8px rgba(124,92,255,0.35)',
      },
    },
  },
  plugins: [],
}
