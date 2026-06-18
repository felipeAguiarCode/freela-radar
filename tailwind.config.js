/** @type {import('tailwindcss').Config} */
const rgb = (cssVar) => `rgb(var(${cssVar}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: rgb('--bg-page'),
        card: rgb('--bg-card'),
        border: rgb('--border'),
        muted: rgb('--text-muted'),
        secondary: rgb('--text-secondary'),
        primary: rgb('--text-primary'),
        purple: {
          DEFAULT: rgb('--purple'),
          soft: rgb('--purple-soft'),
          softer: rgb('--purple-softer'),
          ring: rgb('--purple-ring'),
        },
        green: {
          DEFAULT: rgb('--green'),
          soft: rgb('--green-soft'),
        },
        blue: {
          DEFAULT: rgb('--blue'),
          soft: rgb('--blue-soft'),
        },
        amber: {
          DEFAULT: rgb('--amber'),
          soft: rgb('--amber-soft'),
        },
        rose: {
          DEFAULT: rgb('--rose'),
        },
      },
      fontFamily: {
        // Stack tipográfica Apple (San Francisco) com fallbacks cross-platform:
        // macOS → SF; Windows → Segoe UI; demais → Helvetica Neue/Arial.
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"Segoe UI"',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04)',
        cardHover: '0 6px 24px rgba(16, 24, 40, 0.06)',
      },
      keyframes: {
        // Pulso de radar: a onda dispara, expande e some — depois fica em pausa
        // até o próximo ciclo. Como é uma animação CSS com a mesma duração em
        // todos os cards (montados juntos), os pulsos ficam sincronizados.
        'radar-ping': {
          '0%': { transform: 'scale(1)', opacity: '0.55' },
          '35%': { transform: 'scale(3.2)', opacity: '0' },
          '100%': { transform: 'scale(3.2)', opacity: '0' },
        },
        'bomberman-select': {
          '0%':   { transform: 'translateY(0)' },
          '15%':  { transform: 'translateY(-18%)' },
          '30%':  { transform: 'translateY(0)' },
          '42%':  { transform: 'translateY(-10%)' },
          '54%':  { transform: 'translateY(0)' },
          '64%':  { transform: 'translateY(-4%)' },
          '74%':  { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(0)' },
        },
        // Splash — ondas de radar emanando do logo
        'splash-ping': {
          '0%':   { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(4.5)', opacity: '0' },
        },
        // Splash — sweep line do radar rotaciona
        'splash-sweep': {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        // Sidebar slide-in da esquerda
        'slide-in-left': {
          '0%':   { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        // Fade-in com slide pra baixo (itens de menu)
        'fade-in-down': {
          '0%':   { opacity: '0', transform: 'translateY(-12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Fade-in com slide pra cima (conteúdo principal)
        'fade-in-up': {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'radar-ping': 'radar-ping 3.2s cubic-bezier(0, 0, 0.2, 1) infinite',
        'bomberman-select': 'bomberman-select 0.5s ease-out',
        'slide-in-left': 'slide-in-left 0.6s cubic-bezier(0.16,1,0.3,1) both',
        'fade-in-down': 'fade-in-down 0.5s ease-out both',
        'fade-in-up': 'fade-in-up 0.6s ease-out both',
      },
    },
  },
  plugins: [],
};
