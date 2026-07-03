import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
}

// Get persisted theme from localStorage, default to dark
const getInitialTheme = (): Theme => {
  try {
    const stored = localStorage.getItem('staytrue-theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}
  return 'dark';
};

const applyTheme = (theme: Theme) => {
  if (theme === 'light') {
    document.documentElement.classList.add('light');
    document.documentElement.classList.remove('dark');
  } else {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  }
};

// Apply theme on load
applyTheme(getInitialTheme());

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: getInitialTheme(),
  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('staytrue-theme', next);
    applyTheme(next);
    set({ theme: next });
  },
}));
