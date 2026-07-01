/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // SF on Apple devices, Inter (loaded in index.html) elsewhere — same clean feel.
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'Inter', '"SF Pro Text"',
          '"Segoe UI"', 'Roboto', 'system-ui', 'sans-serif',
        ],
      },
      colors: {
        // Apple's canvas + ink.
        canvas: '#f5f5f7',
        ink: {
          DEFAULT: '#1d1d1f',
          soft: '#42424a',
          muted: '#6e6e73',
        },
        hair: '#e4e4e7', // hairline borders
        // Accent reskinned to Apple blue. The app already uses `indigo-*` as its accent,
        // so overriding the scale reskins every button/link/active state at once.
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
        lg: '0.625rem',   // 10
        xl: '0.875rem',   // 14
        '2xl': '1.25rem', // 20
        '3xl': '1.75rem', // 28
      },
      boxShadow: {
        // Soft, diffuse, low-opacity — Apple depth.
        sm:  '0 1px 2px rgba(0,0,0,0.04)',
        DEFAULT: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)',
        md:  '0 6px 20px rgba(0,0,0,0.06)',
        lg:  '0 12px 32px rgba(0,0,0,0.08)',
        xl:  '0 24px 56px rgba(0,0,0,0.10)',
        '2xl': '0 32px 72px rgba(0,0,0,0.12)',
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.28, 0.11, 0.32, 1)',
      },
    },
  },
  plugins: [],
}
