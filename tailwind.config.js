/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'spin': 'spin 1s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      },
      fontFamily: {
        heading: ['"Playfair Display"', 'serif'],
        body: ['"Open Sans"', 'sans-serif']
      }
    },
  },
  plugins: [],
  corePlugins: {
    preflight: true,
  },
  future: {
    hoverOnlyWhenSupported: true,
  }
}
