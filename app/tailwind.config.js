/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Sketchy paper-notebook palette
        ink: {
          DEFAULT: '#1a1a1a',
          soft: '#3a3a3a',
        },
        paper: {
          DEFAULT: '#fafaf6',
          2: '#f2efe6',
        },
        accent: {
          DEFAULT: '#e85d3c', // orange — CTAs, alerts, your turn
          2: '#2a6f4f',       // green — ready / active / success
          3: '#2d5fa8',       // blue — selected
          y: '#f2c14e',       // yellow — host
        },
        'line-soft': '#8a8376',
        muted: '#b8b1a1',
      },
      fontFamily: {
        display: ['Caveat', 'cursive'],
        body: ['Kalam', 'cursive'],
        accent: ['"Architects Daughter"', 'cursive'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        sketch: '2px 2px 0 #1a1a1a',
        'sketch-sm': '1px 1px 0 #1a1a1a',
        'sketch-lg': '4px 4px 0 #1a1a1a',
        'sketch-accent': '2px 2px 0 #e85d3c',
        'sketch-green': '2px 2px 0 #2a6f4f',
        'sketch-blue': '2px 2px 0 #2d5fa8',
      },
      borderRadius: {
        wobble: '12px 8px 14px 6px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
