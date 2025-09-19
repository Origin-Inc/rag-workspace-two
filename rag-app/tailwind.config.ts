import type { Config } from 'tailwindcss'
import containerQueries from '@tailwindcss/container-queries'

export default {
  content: ['./app/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  safelist: [
    // Dark mode backgrounds
    'dark:bg-dark-primary',
    'dark:bg-dark-secondary',
    // Grid column spans
    'col-span-1', 'col-span-2', 'col-span-3', 'col-span-4', 'col-span-5', 'col-span-6',
    'col-span-7', 'col-span-8', 'col-span-9', 'col-span-10', 'col-span-11', 'col-span-12',
    'sm:col-span-1', 'sm:col-span-2', 'sm:col-span-3', 'sm:col-span-4', 'sm:col-span-5', 'sm:col-span-6',
    'md:col-span-1', 'md:col-span-2', 'md:col-span-3', 'md:col-span-4', 'md:col-span-5', 'md:col-span-6',
    'lg:col-span-1', 'lg:col-span-2', 'lg:col-span-3', 'lg:col-span-4', 'lg:col-span-5', 'lg:col-span-6',
    'xl:col-span-1', 'xl:col-span-2', 'xl:col-span-3', 'xl:col-span-4', 'xl:col-span-5', 'xl:col-span-6',
    'xl:col-span-7', 'xl:col-span-8', 'xl:col-span-9', 'xl:col-span-10', 'xl:col-span-11', 'xl:col-span-12',
    // Grid row spans
    'row-span-1', 'row-span-2', 'row-span-3', 'row-span-4', 'row-span-5', 'row-span-6',
    'sm:row-span-1', 'sm:row-span-2', 'sm:row-span-3', 'sm:row-span-4',
    'md:row-span-1', 'md:row-span-2', 'md:row-span-3', 'md:row-span-4',
    'lg:row-span-1', 'lg:row-span-2', 'lg:row-span-3', 'lg:row-span-4',
    'xl:row-span-1', 'xl:row-span-2', 'xl:row-span-3', 'xl:row-span-4',
  ],
  theme: {
    extend: {
      colors: {
        // Custom theme colors using CSS variables
        'theme': {
          'bg-primary': 'rgba(var(--color-bg-primary), 1)',
          'bg-secondary': 'rgba(var(--color-bg-secondary), 1)',
          'border-primary': 'rgba(var(--color-border-primary), 1)',
          'border-secondary': 'rgba(var(--color-border-secondary), 1)',
          'text-primary': 'rgba(var(--color-text-primary), 1)',
          'text-secondary': 'rgba(var(--color-text-secondary), 1)',
          'text-code': 'rgba(var(--color-text-code), 1)',
          'text-highlight': 'rgba(var(--color-text-highlight), 1)',
      },
      backgroundColor: {
        // Specific dark mode background
        'dark-primary': 'rgba(33, 33, 33, 1)',
        'dark-secondary': 'rgba(50, 50, 50, 1)',
      },
      borderColor: {
        // Specific dark mode border
        'dark-primary': 'rgba(70, 70, 70, 1)',
      },
      gridTemplateColumns: {
        // Custom grid columns for dashboard
        '13': 'repeat(13, minmax(0, 1fr))',
        '14': 'repeat(14, minmax(0, 1fr))',
        '15': 'repeat(15, minmax(0, 1fr))',
        '16': 'repeat(16, minmax(0, 1fr))',
      },
      gridColumn: {
        'span-13': 'span 13 / span 13',
        'span-14': 'span 14 / span 14',
        'span-15': 'span 15 / span 15',
        'span-16': 'span 16 / span 16',
      },
      keyframes: {
        'slide-in-from-top': {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        'slide-in-from-bottom': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        }
      },
      animation: {
        'slide-in-from-top': 'slide-in-from-top 0.3s ease-out',
        'slide-in-from-bottom': 'slide-in-from-bottom 0.5s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
      }
    },
  },
  plugins: [containerQueries],
} satisfies Config