import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { ThemeToggle } from '../components/ThemeToggle';
import { Mail, Lock, Loader2, ArrowRight, Zap } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Please enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
type LoginFormValues = z.infer<typeof loginSchema>;

export const Login: React.FC = () => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: values.email, password: values.password });
      if (error) setErrorMsg(error.message);
      else navigate(from, { replace: true });
    } catch {
      setErrorMsg('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dots bg-app-bg flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-app-border bg-app-panel/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="h-7 w-7 rounded-lg bg-app-accent flex items-center justify-center">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-app-text-body" style={{ fontFamily: 'var(--font-display)' }}>
              StayTrue
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/signup" className="btn-primary px-3 py-1.5 text-sm font-semibold cursor-pointer hidden sm:inline-flex items-center">
              Sign up
            </Link>
          </div>
        </div>
      </header>

      {/* Form area */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md animate-slide-up">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-app-text-body mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              Welcome back
            </h1>
            <p className="text-app-text-secondary text-sm">
              Don't have an account?{' '}
              <Link to="/signup" className="text-app-text-primary font-semibold hover:underline">
                Sign up free
              </Link>
            </p>
          </div>

          {/* Card */}
          <div className="bg-app-panel border border-app-border rounded-2xl p-8 shadow-[var(--shadow)]">
            <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
              {errorMsg && (
                <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
                  {errorMsg}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-app-text-body mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-app-text-dim" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    {...register('email')}
                    placeholder="you@example.com"
                    className={`input-field w-full pl-10 pr-4 py-2.5 text-sm ${errors.email ? 'border-red-500/60' : ''}`}
                  />
                </div>
                {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-app-text-body mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-app-text-dim" />
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    {...register('password')}
                    placeholder="••••••••"
                    className={`input-field w-full pl-10 pr-4 py-2.5 text-sm ${errors.password ? 'border-red-500/60' : ''}`}
                  />
                </div>
                {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</>
                ) : (
                  <>Sign in <ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
