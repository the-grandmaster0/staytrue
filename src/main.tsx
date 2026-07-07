import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { validateEnv } from './lib/env.ts';

// Validate required environment variables before mounting
validateEnv();

// ── Global fix: prevent focus ring flash when clicking buttons/links ─────────
// Suppresses the focus-on-mousedown behaviour that causes a brief outline flash
// on the previously-focused element. Scoped to only buttons and links — never
// inputs, selects, textareas or checkboxes, where preventDefault would break
// native browser behaviour (text cursor placement, checkbox toggle, etc.).
document.addEventListener('mousedown', (e) => {
  const target = e.target as HTMLElement;
  const tag = target.tagName;

  // Never interfere with form controls or editable content
  if (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    tag === 'OPTION' ||
    (target as HTMLElement).isContentEditable
  ) return;

  // Only suppress on buttons and anchor links (and their icon children)
  const btn = target.closest('button');
  const anchor = target.closest('a');
  if (btn || anchor || tag === 'BUTTON' || tag === 'A') {
    e.preventDefault();
  }
}, { capture: false });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
