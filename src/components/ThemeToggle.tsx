import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useThemeStore } from '../store/useThemeStore';

interface ThemeToggleProps {
  /** Extra classes — pass `w-full` when used in sidebar, omit for navbar */
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`btn-ghost inline-flex items-center gap-2 px-3 py-2 text-sm cursor-pointer shrink-0 ${className}`}
    >
      {isDark ? (
        <>
          <Sun className="h-4 w-4 text-amber-400 shrink-0" />
          <span className="hidden sm:inline">Light mode</span>
        </>
      ) : (
        <>
          <Moon className="h-4 w-4 text-indigo-500 shrink-0" />
          <span className="hidden sm:inline">Dark mode</span>
        </>
      )}
    </button>
  );
};
