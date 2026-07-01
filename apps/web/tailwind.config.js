/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"',
          '"Segoe UI"', 'system-ui', 'sans-serif',
        ],
        mono: [
          'ui-monospace', '"SF Mono"', '"Cascadia Code"', '"Fira Code"',
          'Menlo', 'Consolas', 'monospace',
        ],
      },
      colors: {
        canvas:  '#f5f5f7',
        surface: '#ffffff',
        ink: {
          DEFAULT: '#1d1d1f',
          soft:    '#42424a',
          muted:   '#86868b',
        },
        hair: '#d2d2d7',
        // Apple blue — the one accent color used throughout the system.
        // Overrides Tailwind's indigo scale so every indigo-* class uses this palette.
        indigo: {
          50:  '#eef6ff',
          100: '#d9ebff',
          200: '#b6d8ff',
          300: '#83bdff',
          400: '#4a9eff',
          500: '#1a82f7',
          600: '#0071e3',
          700: '#0060c4',
          800: '#004e9e',
          900: '#003c78',
        },
      },
      borderRadius: {
        sm:    '0.25rem',
        DEFAULT: '0.375rem',
        md:    '0.5rem',
        lg:    '0.625rem',
        xl:    '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      boxShadow: {
        sm:  '0 1px 2px rgba(0,0,0,0.04)',
        DEFAULT: '0 1px 3px rgba(0,0,0,0.05)',
        md:  '0 4px 12px rgba(0,0,0,0.06)',
        lg:  '0 8px 24px rgba(0,0,0,0.07)',
        none: 'none',
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.28, 0.11, 0.32, 1)',
      },
    },
  },
  plugins: [],
}
