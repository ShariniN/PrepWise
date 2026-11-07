/** @type {import('tailwindcss').Config} */
const rgb = (v) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Semantic tokens (backed by CSS variables in index.css so a dark theme can remap them).
        ink: { DEFAULT: rgb('--c-ink'), 2: rgb('--c-ink-2'), muted: rgb('--c-muted'), deep: '#14122b' },
        paper: rgb('--c-paper'),
        surface: rgb('--c-surface'),
        sand: rgb('--c-sand'),
        line: rgb('--c-line'),
        primary: {
          50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8',
          500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3', 900: '#312e81',
          DEFAULT: '#4f46e5',
        },
        sun: { 50: '#fff8e6', 100: '#ffefc2', 200: '#ffe08a', 300: '#ffd061', 400: '#ffb938', 500: '#f59e0b', 600: '#c77d06', 700: '#92590a', DEFAULT: '#ffb938' },
        success: { 50: '#ecfdf3', 100: '#d1fadf', 500: '#16a34a', 600: '#15803d', 700: '#116932', DEFAULT: '#16a34a' },
        danger: { 50: '#fff0f0', 100: '#ffe0e1', 500: '#e5484d', 600: '#c93035', 700: '#a3252a', DEFAULT: '#e5484d' },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', '"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: { '4xl': '2rem', section: '2.5rem' },
      boxShadow: {
        soft: '0 1px 2px rgb(20 18 43 / 0.04), 0 4px 12px rgb(20 18 43 / 0.05)',
        card: '0 1px 2px rgb(20 18 43 / 0.04), 0 8px 24px -4px rgb(20 18 43 / 0.08), 0 24px 48px -12px rgb(20 18 43 / 0.06)',
        float: '0 2px 4px rgb(20 18 43 / 0.05), 0 16px 40px -8px rgb(20 18 43 / 0.16), 0 40px 80px -20px rgb(79 70 229 / 0.18)',
        pill: '0 1px 0 rgb(255 255 255 / 0.7) inset, 0 6px 24px -6px rgb(20 18 43 / 0.18), 0 1px 3px rgb(20 18 43 / 0.08)',
        ring: '0 0 0 4px rgb(79 70 229 / 0.18)',
      },
      keyframes: {
        'reveal-in': { from: { opacity: '0', transform: 'translateY(24px) scale(.96)', filter: 'blur(12px)' }, to: { opacity: '1', transform: 'none', filter: 'blur(0)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': { from: { opacity: '0', transform: 'scale(.95) translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        'sheet-in': { from: { opacity: '0', transform: 'translateY(-12px) scale(.98)' }, to: { opacity: '1', transform: 'none' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        'float-slow': { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(8px)' } },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'tick-in': { from: { opacity: '0', transform: 'translateX(-6px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        'reveal-in': 'reveal-in .9s cubic-bezier(.2,.7,.2,1) both',
        'fade-in': 'fade-in .25s ease-out both',
        'pop-in': 'pop-in .3s cubic-bezier(.2,.7,.2,1) both',
        'sheet-in': 'sheet-in .25s cubic-bezier(.2,.7,.2,1) both',
        float: 'float 7s ease-in-out infinite',
        'float-slow': 'float-slow 9s ease-in-out infinite',
        marquee: 'marquee 30s linear infinite',
        'tick-in': 'tick-in .4s ease-out both',
        shimmer: 'shimmer 1.4s infinite',
      },
    },
  },
  plugins: [],
}
