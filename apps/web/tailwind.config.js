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
        // Enterprise neutral canvas + ink.
        canvas: '#f5f7fb',
        ink: {
          DEFAULT: '#111827',
          soft: '#374151',
          muted: '#6b7280',
        },
        hair: '#e5e7eb', // hairline borders
        // Primary enterprise action color.
        indigo: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#2563eb',
          600: '#1e3a8a',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#172554',
        },
        blue: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        emerald: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        amber: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        orange: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        red: {
          50:  '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        gray: {
          50:  '#f5f7fb',
          100: '#e5e7eb',
          200: '#d1d5db',
          300: '#9ca3af',
          400: '#6b7280',
          500: '#4b5563',
          600: '#374151',
          700: '#1f2937',
          800: '#111827',
          900: '#0f172a',
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
