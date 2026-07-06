import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Loader2, Zap, CheckCircle2, XCircle } from 'lucide-react';

/**
 * Handles the redirect after a user clicks the email confirmation link.
 * Supabase appends a token hash to the URL — this page exchanges it for a session.
 */
export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // supabase-js v2 automatically exchanges the hash token on getSession()
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          setErrorMessage(error.message);
          setStatus('error');
          return;
        }

        if (data.session) {
          setStatus('success');
          // Brief success flash, then redirect to dashboard
          setTimeout(() => navigate('/dashboard', { replace: true }), 1500);
        } else {
          // No session yet — try exchanging the URL hash manually
          const hashParams = new URLSearchParams(window.location.hash.slice(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');

          if (accessToken && refreshToken) {
            const { error: setError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (setError) {
              setErrorMessage(setError.message);
              setStatus('error');
            } else {
              setStatus('success');
              setTimeout(() => navigate('/dashboard', { replace: true }), 1500);
            }
          } else {
            setErrorMessage('Invalid or expired confirmation link. Please sign up again.');
            setStatus('error');
          }
        }
      } catch {
        setErrorMessage('Something went wrong. Please try again.');
        setStatus('error');
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-dots bg-app-bg flex flex-col">
      <header className="sticky top-0 z-40 border-b border-app-border bg-app-panel/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-app-accent flex items-center justify-center">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-app-text-body" style={{ fontFamily: 'var(--font-display)' }}>
              StayTrue
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center animate-slide-up">
          {status === 'loading' && (
            <>
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-app-accent/10 border border-app-accent/30 mb-6 mx-auto">
                <Loader2 className="h-8 w-8 animate-spin text-app-accent" />
              </div>
              <h2 className="text-2xl font-bold text-app-text-body mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                Confirming your email…
              </h2>
              <p className="text-app-text-secondary text-sm">Just a moment while we verify your account.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-500/10 border border-green-500/30 mb-6 mx-auto">
                <CheckCircle2 className="h-8 w-8 text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-app-text-body mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                Email confirmed!
              </h2>
              <p className="text-app-text-secondary text-sm">Redirecting you to your dashboard…</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-red-500/10 border border-red-500/30 mb-6 mx-auto">
                <XCircle className="h-8 w-8 text-red-400" />
              </div>
              <h2 className="text-2xl font-bold text-app-text-body mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                Confirmation failed
              </h2>
              <p className="text-app-text-secondary text-sm mb-6">{errorMessage}</p>
              <button
                onClick={() => navigate('/signup', { replace: true })}
                className="btn-primary inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold"
              >
                Back to sign up
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
