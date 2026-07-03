import React, { useEffect, useRef, useState } from 'react';
import { Zap, X, Download } from 'lucide-react';

// Track sessions in localStorage. A "session" is counted once per page load
// using sessionStorage as a gate so refreshes don't increment.
const SESSION_COUNT_KEY = 'staytrue-session-count';
const DISMISSED_KEY = 'staytrue-install-dismissed';
const SESSION_GATE_KEY = 'staytrue-session-counted';
const SESSION_THRESHOLD = 3;

function incrementSessionCount(): number {
  // Only count once per browser session (tab)
  if (sessionStorage.getItem(SESSION_GATE_KEY)) {
    return parseInt(localStorage.getItem(SESSION_COUNT_KEY) || '0', 10);
  }
  sessionStorage.setItem(SESSION_GATE_KEY, '1');
  const current = parseInt(localStorage.getItem(SESSION_COUNT_KEY) || '0', 10);
  const next = current + 1;
  localStorage.setItem(SESSION_COUNT_KEY, String(next));
  return next;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallPrompt: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Don't show if already dismissed
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // Increment session and check threshold
    const count = incrementSessionCount();

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      if (count >= SESSION_THRESHOLD) {
        setVisible(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt.current) return;
    setInstalling(true);
    deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem(DISMISSED_KEY, 'true');
    }
    setInstalling(false);
    setVisible(false);
    deferredPrompt.current = null;
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-80 z-50 animate-slide-up"
      role="banner"
      aria-label="Install StayTrue app"
    >
      <div className="bg-app-panel border border-app-border-active/40 rounded-2xl p-4 shadow-[0_8px_32px_rgba(99,102,241,0.2)] flex items-center gap-3">
        {/* App icon */}
        <div className="h-12 w-12 rounded-xl bg-app-accent flex items-center justify-center shrink-0">
          <Zap className="h-6 w-6 text-white" />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-app-text-body leading-tight">
            Add to Home Screen
          </p>
          <p className="text-xs text-app-text-secondary mt-0.5 leading-relaxed">
            Install StayTrue for a faster, app-like experience.
          </p>
        </div>

        {/* Close */}
        <button
          onClick={handleDismiss}
          className="p-2 rounded-lg text-app-text-dim hover:text-app-text-secondary hover:bg-app-accent-bg transition-colors shrink-0"
          aria-label="Dismiss install prompt"
          style={{ minHeight: '44px', minWidth: '44px' }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Action row */}
      <div className="mt-2 flex gap-2">
        <button
          onClick={handleDismiss}
          className="flex-1 btn-ghost py-2.5 text-sm cursor-pointer"
          style={{ minHeight: '44px' }}
        >
          Not now
        </button>
        <button
          onClick={handleInstall}
          disabled={installing}
          className="flex-1 btn-primary flex items-center justify-center gap-2 py-2.5 text-sm cursor-pointer disabled:opacity-50"
          style={{ minHeight: '44px' }}
        >
          <Download className="h-4 w-4" />
          {installing ? 'Installing…' : 'Install'}
        </button>
      </div>
    </div>
  );
};
