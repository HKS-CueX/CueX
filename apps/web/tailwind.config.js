/** @type {import('tailwindcss').Config} */
export default {
  content: {
    relative: true,
    files: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  },
  theme: {
    extend: {
      colors: {
        ground: {
          DEFAULT: 'var(--ground, #F8F7F3)',
          2: 'var(--ground-2, #F0EFE9)',
          3: 'var(--ground-3, #E6E4DC)',
        },
        surface: {
          DEFAULT: 'var(--surface, #FFFFFF)',
          muted: 'var(--ground-2, #F0EFE9)',
        },
        ink: {
          DEFAULT: 'var(--ink, #111318)',
          2: 'var(--ink-2, #474B57)',
          3: 'var(--ink-3, #626774)',
          hover: 'var(--ink-hover, #252833)',
        },
        line: {
          DEFAULT: 'var(--line, #E2DFD7)',
          strong: 'var(--line-strong, #C9C5BA)',
        },
        amber: {
          DEFAULT: 'var(--amber, #E87A24)',
          ink: 'var(--amber-ink, #A84B07)',
          tint: 'var(--amber-tint, #FBF0E6)',
        },
        violet: {
          DEFAULT: 'var(--violet, #7C3AED)', // taste-skill-ignore: CueX brand System 2 violet token
          ink: 'var(--violet-ink, #5B21B6)',
          tint: 'var(--violet-tint, #F1EBFE)',
        },
        resolved: {
          DEFAULT: 'var(--resolved, #1F6B52)',
          tint: 'var(--resolved-tint, #E3F1EC)',
        },
        alert: {
          DEFAULT: 'var(--alert, #B83B1D)',
          tint: 'var(--alert-tint, #FCEEE9)',
        },
      },
      fontFamily: {
        display: ['"Instrument Serif"', '"Noto Serif SC"', 'Georgia', 'serif'],
        serif: ['"Noto Serif SC"', '"Instrument Serif"', '"Songti SC"', 'serif'],
        ui: ['"Inter"', '"Noto Sans SC"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        sans: ['"Inter"', '"Noto Sans SC"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '4px',
        none: '0',
        sm: '2px',
        md: '6px',
        lg: '10px',
      },
      lineHeight: {
        tight: '1.14',
        ui: '1.55',
        read: '1.7',
      },
      transitionTimingFunction: {
        'out-custom': 'cubic-bezier(0.23, 1, 0.32, 1)',
        'in-out-custom': 'cubic-bezier(0.77, 0, 0.175, 1)',
        drawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [],
};
