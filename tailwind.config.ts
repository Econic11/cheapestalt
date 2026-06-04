import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        page: '#0A0A0F',
        surface: '#13131A',
        accent: '#FF6B2B',
        success: '#00D4AA',
      },
      boxShadow: {
        glow: '0 20px 60px rgba(255,107,43,0.18)',
      },
    },
  },
  plugins: [],
}

export default config
