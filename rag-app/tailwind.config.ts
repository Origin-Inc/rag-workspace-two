import type { Config } from 'tailwindcss'
import containerQueries from '@tailwindcss/container-queries'

export default {
  content: ['./app/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  safelist: [
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
      }
    },
  },
  plugins: [containerQueries],
} satisfies Config