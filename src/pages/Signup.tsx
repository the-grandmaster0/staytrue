import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { ThemeToggle } from '../components/ThemeToggle';
import { Mail, Lock, User as UserIcon, Loader2, ArrowRight, Zap, CheckCircle2 } from 'lucide-react';

const signupSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().min(1, 'Email is required').email('Please enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  timezone: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});
type SignupFormValues = z.infer<typeof signupSchema>;

export const Signup: React.FC = () => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors } } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: '', email: '', password: '', confirmPassword: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    },
  });

  const onSubmit = async (values: SignupFormValues) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: { full_name: values.fullName, timezone: values.timezone },
          // Use the current origin so the link works in both local dev and production
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) setErrorMsg(error.message);
      else if (data.user && data.session) navigate('/dashboard');
      else setSuccess(true);
    } catch {
      setErrorMsg('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-dots bg-app-bg flex flex-col">
        <header className="sticky top-0 z-40 border-b border-app-border bg-app-panel/80 backdrop-blur-md">
          <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <div className="h-7 w-7 rounded-lg bg-app-accent flex items-center justify-center">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-app-text-body" style={{ fontFamily: 'var(--font-display)' }}>StayTrue</span>
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-md text-center animate-slide-up">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-500/10 border border-green-500/30 mb-6 mx-auto">
              <CheckCircle2 className="h-8 w-8 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-app-text-body mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              Check your inbox
            </h2>
            <p className="text-app-text-secondary text-sm mb-6 leading-relaxed">
              We sent a confirmation link to your email. Click it to activate your account and start tracking your goals.
            </p>
            <Link to="/login" className="btn-primary inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

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
            <Link to="/login" className="btn-ghost px-3 py-1.5 text-sm font-medium cursor-pointer hidden sm:inline-flex items-center">
              Sign in
            </Link>
          </div>
        </div>
      </header>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md animate-slide-up">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-app-text-body mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              Create your account
            </h1>
            <p className="text-app-text-secondary text-sm">
              Already have one?{' '}
              <Link to="/login" className="text-app-text-primary font-semibold hover:underline">Sign in</Link>
            </p>
          </div>

          <div className="bg-app-panel border border-app-border rounded-2xl p-8 shadow-[var(--shadow)]">
            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
              {errorMsg && (
                <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
                  {errorMsg}
                </div>
              )}

              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-app-text-body mb-1.5">Full name</label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-app-text-dim" />
                  <input id="fullName" type="text" {...register('fullName')} placeholder="Jane Doe"
                    className={`input-field w-full pl-10 pr-4 py-2.5 text-sm ${errors.fullName ? 'border-red-500/60' : ''}`} />
                </div>
                {errors.fullName && <p className="mt-1 text-xs text-red-400">{errors.fullName.message}</p>}
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-app-text-body mb-1.5">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-app-text-dim" />
                  <input id="email" type="email" {...register('email')} placeholder="you@example.com"
                    className={`input-field w-full pl-10 pr-4 py-2.5 text-sm ${errors.email ? 'border-red-500/60' : ''}`} />
                </div>
                {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-app-text-body mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-app-text-dim" />
                  <input id="password" type="password" {...register('password')} placeholder="Min. 8 characters"
                    className={`input-field w-full pl-10 pr-4 py-2.5 text-sm ${errors.password ? 'border-red-500/60' : ''}`} />
                </div>
                {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>}
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-app-text-body mb-1.5">Confirm password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-app-text-dim" />
                  <input id="confirmPassword" type="password" {...register('confirmPassword')} placeholder="Re-type password"
                    className={`input-field w-full pl-10 pr-4 py-2.5 text-sm ${errors.confirmPassword ? 'border-red-500/60' : ''}`} />
                </div>
                {errors.confirmPassword && <p className="mt-1 text-xs text-red-400">{errors.confirmPassword.message}</p>}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {isLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Creating account...</>
                ) : (
                  <>Create account <ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
