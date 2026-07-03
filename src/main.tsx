import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { validateEnv } from './lib/env.ts';

// Validate required environment variables before mounting
validateEnv();

// ── Global fix: prevent focus ring flash when clicking buttons/links ─────────
// Prevents browser from moving focus on mousedown (which causes the
// brief outline flash on the previously-focused element).
// onClick still fires normally — only the focus-on-mousedown is suppressed.
document.addEventListener('mousedown', (e) => {
  const target = e.target as HTMLElement;
  if (
    target.tagName === 'BUTTON' ||
    target.tagName === 'A' ||
    target.closest('button') ||
    target.closest('a')
  ) {
    e.preventDefault();
  }
}, { capture: false });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
