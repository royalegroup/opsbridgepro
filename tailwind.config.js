/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50:'#f0f4ff',100:'#e0e9ff',200:'#c7d7fe',300:'#a5b8fc',400:'#8193f8',500:'#6470f1',600:'#4f52e5',700:'#4240ca',800:'#3637a3',900:'#313481',950:'#1e1f4d' },
        surface: { 0:'#ffffff',50:'#f8f9fc',100:'#f0f2f8',200:'#e4e7f0',300:'#cdd2e0' },
        ink: { 900:'#0f1117',700:'#2d3142',500:'#5a6074',300:'#9ba3b8',100:'#d4d8e8' },
        success:'#16a34a', warning:'#d97706', danger:'#dc2626', cod:'#0891b2',
      },
      fontFamily: { sans:['Inter','system-ui','sans-serif'], mono:['JetBrains Mono','monospace'] },
      borderRadius: { xl:'1rem','2xl':'1.25rem' },
      boxShadow: { card:'0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)', panel:'0 4px 16px -2px rgb(0 0 0 / 0.08)' },
    },
  },
  plugins: [],
}
