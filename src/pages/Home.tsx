import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';
import {
  Target, Flame, BarChart3, Lock, Zap, ArrowRight,
  Users, MessageSquare, CheckCircle2, ChevronRight,
} from 'lucide-react';

const QUOTES = [
  { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Aristotle' },
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { text: 'Success is the sum of small efforts repeated day in and day out.', author: 'Robert Collier' },
  { text: 'Discipline is choosing between what you want now and what you want most.', author: 'Abraham Lincoln' },
  { text: 'You do not rise to the level of your goals. You fall to the level of your systems.', author: 'James Clear' },
];

const FEATURES = [
  {
    icon: Target,
    title: 'Goal Tracking',
    desc: 'Define goals across Fitness, Learning, Mindfulness, Finance, Career, and more — with frequencies and deadlines.',
  },
  {
    icon: Flame,
    title: 'Streak Engine',
    desc: 'Track consecutive check-in streaks. Daily, weekly, or 3× per week. Break the chain and you know immediately.',
  },
  {
    icon: BarChart3,
    title: 'Progress Heatmap',
    desc: 'Every check-in plotted as a contribution heatmap. See 12 weeks of consistency at a single glance.',
  },
  {
    icon: Users,
    title: 'Accountability Buddies',
    desc: 'Invite a friend or get instantly matched with a stranger in the same goal category. Accountability is a team sport.',
  },
  {
    icon: MessageSquare,
    title: 'Real-Time Messaging',
    desc: 'Chat with your buddy per goal. Quick reactions like 🔥 💪 🎉 make it easy to cheer each other on.',
  },
  {
    icon: Lock,
    title: 'Private by Design',
    desc: 'Row-Level Security enforced at the database layer. Your data is yours — never shared, never sold.',
  },
];

const hexClip = 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))';
const hexClipSm = 'polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 5px 100%, 0 calc(100% - 5px))';

export const Home: React.FC = () => {
  const [quoteIdx, setQuoteIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setQuoteIdx((i) => (i + 1) % QUOTES.length);
        setFade(true);
      }, 400);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const q = QUOTES[quoteIdx];

  return (
    <div className="min-h-screen bg-app-bg text-app-text-body">

      {/* ── Nav ───────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-app-border bg-app-panel relative">
        <div className="animate-scan-line" />
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <div
              className="h-8 w-8 border border-blue-500/60 flex items-center justify-center relative"
              style={{ clipPath: hexClipSm }}
            >
              <div className="absolute inset-0 bg-blue-600/20" />
              <Zap className="h-4 w-4 text-blue-400 relative z-10" />
            </div>
            <div>
              <span className="font-black text-base text-app-text-body tracking-widest uppercase" style={{ fontFamily: 'var(--font-display)' }}>
                StayTrue
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/login" className="btn-ghost px-4 py-2 text-xs cursor-pointer hidden sm:inline-flex items-center">
              SIGN IN
            </Link>
            <Link to="/signup" className="btn-primary px-4 py-2 text-xs cursor-pointer inline-flex items-center gap-1.5">
              GET STARTED <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Grid background */}
        <div className="absolute inset-0 bg-dots pointer-events-none" />
        {/* Blue glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-blue-600/10 blur-[80px] rounded-full pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-6 py-28 text-center">
          {/* Status badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-2 border border-blue-500/30 bg-blue-950/40 text-xs font-mono text-blue-400 mb-10 uppercase tracking-widest"
            style={{ clipPath: hexClipSm }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
            ACCOUNTABILITY OS · ACTIVE
          </div>

          <h1
            className="text-5xl sm:text-7xl font-black text-app-text-body tracking-tight leading-none mb-6 uppercase"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            STAY <span className="text-blue-400">TRUE</span>
            <br />
            <span className="text-3xl sm:text-5xl text-app-text-secondary font-bold tracking-widest">
              TO YOUR GOALS
            </span>
          </h1>

          <p className="max-w-xl mx-auto text-base text-app-text-secondary leading-relaxed mb-12 font-mono">
            Set meaningful goals. Build unbreakable streaks.<br />
            Stay accountable with a buddy who pushes you forward.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/signup"
              className="btn-primary flex items-center gap-2 px-8 py-3.5 text-sm cursor-pointer"
            >
              INITIALIZE ACCOUNT <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/login"
              className="btn-ghost flex items-center gap-2 px-8 py-3.5 text-sm cursor-pointer"
            >
              SIGN IN
            </Link>
          </div>
        </div>
      </section>

      {/* ── Rotating motivational quote ───────────────────────────────────── */}
      <section className="border-y border-app-border bg-app-panel relative overflow-hidden">
        <div className="animate-scan-line" />
        <div className="max-w-3xl mx-auto px-6 py-12 text-center">
          <p className="section-label mb-6">// DAILY PROTOCOL</p>
          <div
            style={{ opacity: fade ? 1 : 0, transition: 'opacity 0.4s ease' }}
            className="space-y-3"
          >
            <p className="text-xl sm:text-2xl font-bold text-app-text-body leading-snug" style={{ fontFamily: 'var(--font-display)' }}>
              "{q.text}"
            </p>
            <p className="text-sm font-mono text-blue-400/80 uppercase tracking-widest">
              — {q.author}
            </p>
          </div>
          {/* Quote dots */}
          <div className="flex items-center justify-center gap-2 mt-8">
            {QUOTES.map((_, i) => (
              <button
                key={i}
                onClick={() => { setFade(false); setTimeout(() => { setQuoteIdx(i); setFade(true); }, 300); }}
                className={`h-1 rounded-none transition-all ${i === quoteIdx ? 'w-6 bg-blue-400' : 'w-2 bg-app-border'}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <p className="section-label mb-3">// MISSION PROTOCOL</p>
          <h2 className="text-3xl font-black text-app-text-body uppercase tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>
            Four Steps to Dominance
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            {
              step: '01',
              icon: CheckCircle2,
              title: 'Create Your Account',
              desc: 'Sign up in under 60 seconds. Your data is isolated and secured at the database level. No exceptions.',
            },
            {
              step: '02',
              icon: Target,
              title: 'Define Your Goals',
              desc: 'Use the 3-step wizard to set a goal with category, check-in frequency, and an optional deadline.',
            },
            {
              step: '03',
              icon: Flame,
              title: 'Check In Daily',
              desc: 'Log progress with one tap. Build a streak. Watch the heatmap fill up. Miss a day — the system knows.',
            },
            {
              step: '04',
              icon: Users,
              title: 'Activate Your Buddy',
              desc: 'Invite someone you trust or get matched instantly with a stranger in your goal category. Accountability multiplied.',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="bg-app-panel border border-app-border p-6 card-glow relative"
                style={{ clipPath: hexClip }}
              >
                <div className="flex items-start gap-4">
                  <span
                    className="text-4xl font-black text-blue-500/20 shrink-0 leading-none"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {item.step}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="h-4 w-4 text-blue-400" />
                      <h3
                        className="text-sm font-black text-app-text-body uppercase tracking-wider"
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {item.title}
                      </h3>
                    </div>
                    <p className="text-sm text-app-text-secondary leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section className="border-t border-app-border bg-app-panel">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center mb-14">
            <p className="section-label mb-3">// SYSTEM CAPABILITIES</p>
            <h2 className="text-3xl font-black text-app-text-body uppercase tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>
              Full Feature Arsenal
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="bg-app-bg border border-app-border p-5 card-glow group">
                  <div
                    className="inline-flex p-2.5 border border-blue-500/30 bg-blue-950/40 mb-4 group-hover:border-blue-400/60 transition-colors"
                    style={{ clipPath: hexClipSm }}
                  >
                    <Icon className="h-4 w-4 text-blue-400" />
                  </div>
                  <h3
                    className="text-sm font-black text-app-text-body mb-2 uppercase tracking-wide"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {f.title}
                  </h3>
                  <p className="text-sm text-app-text-secondary leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Motivational CTA ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-app-border">
        <div className="absolute inset-0 bg-dots pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-blue-950/30 to-transparent pointer-events-none" />
        <div className="relative max-w-3xl mx-auto px-6 py-28 text-center">
          <p className="section-label mb-6">// COMMIT TO THE MISSION</p>
          <h2
            className="text-4xl sm:text-5xl font-black text-app-text-body uppercase tracking-tight leading-none mb-4"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            THE PERSON YOU <br />
            <span className="text-blue-400">WANT TO BECOME</span><br />
            IS BUILT TODAY.
          </h2>
          <p className="text-base font-mono text-app-text-secondary mb-10 mt-6">
            Not tomorrow. Not Monday. Right now.<br />
            One goal. One check-in. One step forward.
          </p>
          <Link
            to="/signup"
            className="btn-primary inline-flex items-center gap-2 px-10 py-4 text-sm cursor-pointer"
          >
            BEGIN YOUR MISSION <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-6 text-xs font-mono text-app-text-dim">
            Free forever · No credit card · No excuses
          </p>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-app-border bg-app-panel px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div
              className="h-6 w-6 border border-blue-500/40 flex items-center justify-center"
              style={{ clipPath: hexClipSm }}
            >
              <Zap className="h-3 w-3 text-blue-400" />
            </div>
            <span className="text-sm font-black text-app-text-body uppercase tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>
              StayTrue
            </span>
          </div>
          <p className="text-xs font-mono text-app-text-dim">© 2026 StayTrue — Built for those who follow through.</p>
          <div className="flex gap-4">
            <Link to="/login" className="text-xs font-mono text-app-text-secondary hover:text-blue-400 transition-colors uppercase tracking-widest">Sign in</Link>
            <Link to="/signup" className="text-xs font-mono text-app-text-secondary hover:text-blue-400 transition-colors uppercase tracking-widest">Sign up</Link>
          </div>
        </div>
      </footer>

    </div>
  );
};
