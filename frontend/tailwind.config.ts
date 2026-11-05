import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          1: 'oklch(16% 0.02 215)',
          2: 'oklch(12% 0.015 240)',
          3: 'oklch(14% 0.018 220)',
        },
        sidebar: {
          bg: 'oklch(10% 0.02 245)',
          border: 'oklch(25% 0.022 220)',
          text: 'oklch(84% 0.015 240)',
        },
        border: 'oklch(25% 0.022 220)',
        'border-focus': 'oklch(40% 0.06 135)',
        accent: {
          lime: 'oklch(82% 0.21 135)',
          'lime-hover': 'oklch(88% 0.22 135)',
          'lime-text': 'oklch(12% 0.04 135)',
          emerald: 'oklch(68% 0.16 175)',
        },
        text: {
          primary: 'oklch(96% 0.005 240)',
          secondary: 'oklch(84% 0.015 240)',
          muted: 'oklch(62% 0.02 240)',
        },
        status: {
          success: {
            surface: 'oklch(20% 0.04 150)',
            text: 'oklch(80% 0.16 150)',
            border: 'oklch(32% 0.08 150)',
          },
          warning: {
            surface: 'oklch(22% 0.05 75)',
            text: 'oklch(82% 0.14 75)',
            border: 'oklch(35% 0.09 75)',
          },
          error: {
            surface: 'oklch(20% 0.06 25)',
            text: 'oklch(78% 0.16 25)',
            border: 'oklch(34% 0.10 25)',
          },
        },
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1.4' }],
        sm: ['0.875rem', { lineHeight: '1.5' }],
        base: ['0.875rem', { lineHeight: '1.5' }],
        lg: ['1.125rem', { lineHeight: '1.6' }],
        xl: ['1.5rem', { lineHeight: '1.6' }],
        '2xl': ['1.875rem', { lineHeight: '1.6' }],
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
      },
      spacing: {
        xs: '0.5rem',
        sm: '0.75rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0, 0, 0, 0.4)',
        dialog: '0 16px 36px rgba(0, 0, 0, 0.6)',
      },
    },
  },
  plugins: [],
} satisfies Config
