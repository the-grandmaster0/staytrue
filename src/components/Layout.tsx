import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { ThemeToggle } from './ThemeToggle';
import { useUnreadMessageCount } from '../hooks/useMessages';
import { usePendingChallenges } from '../hooks/useChallenges';
import { OnlineBadge } from './OnlineBadge';
import {
  LayoutDashboard,
  User as UserIcon,
  LogOut,
  Zap,
  Shuffle,
  MessageSquare,
  Bell,
  Users,
  Swords,
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { profile, signOut } = useAuthStore();
  const location = useLocation();
  const { data: unreadCount = 0 } = useUnreadMessageCount();
  const { data: pendingChallenges = [] } = usePendingChallenges();
  const challengeBadge = pendingChallenges.length;

  const handleSignOut = async () => {
    await signOut();
  };

  const sidebarNavItems = [
    { label: 'Dashboard',     path: '/dashboard',                icon: LayoutDashboard, badge: 0              },
    { label: 'Find a Buddy',  path: '/dashboard/find-buddy',     icon: Shuffle,         badge: 0              },
    { label: 'Messages',      path: '/dashboard/messages',       icon: MessageSquare,   badge: unreadCount    },
    { label: 'Challenges',    path: '/dashboard/challenges',     icon: Swords,          badge: challengeBadge },
    { label: 'Notifications', path: '/dashboard/notifications',  icon: Bell,            badge: 0              },
    { label: 'Profile',       path: '/dashboard/profile',        icon: UserIcon,        badge: 0              },
  ];

  const bottomNavItems = [
    { label: 'Home',       path: '/dashboard',               icon: LayoutDashboard, badge: 0              },
    { label: 'Buddy',      path: '/dashboard/find-buddy',    icon: Shuffle,         badge: 0              },
    { label: 'Buddies',    path: '/dashboard?tab=buddies',   icon: Users,           badge: 0              },
    { label: 'Messages',   path: '/dashboard/messages',      icon: MessageSquare,   badge: unreadCount    },
    { label: 'Challenges', path: '/dashboard/challenges',    icon: Swords,          badge: challengeBadge },
  ];

  const isActive = (path: string) => {
    const [basePath, query] = path.split('?');
    if (location.pathname !== basePath) return false;
    // If the nav item has a tab query param, match it against the URL
    if (query) {
      const navTab = new URLSearchParams(query).get('tab');
      const urlTab = new URLSearchParams(location.search).get('tab');
      return navTab === urlTab;
    }
    // Plain path (no query) — only active when URL also has no tab param
    return !new URLSearchParams(location.search).get('tab');
  };

  const hexClip = 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))';
  const hexClipSm = 'polygon(0 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 4px 100%, 0 calc(100% - 4px))';
  const hexClipXl = 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))';

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-20 flex items-center justify-between px-5 border-b border-app-border shrink-0 relative">
        <div className="animate-scan-line" />
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 border border-blue-500/60 flex items-center justify-center relative"
            style={{ clipPath: hexClip }}
          >
            <div className="absolute inset-0 bg-blue-600/20" />
            <Zap className="h-5 w-5 text-blue-400 relative z-10" />
          </div>
          <div>
            <span
              className="font-black text-base text-app-text-body tracking-widest uppercase"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              StayTrue
            </span>
            <p className="text-[9px] text-blue-500/70 font-mono uppercase tracking-[0.2em] -mt-0.5">
              SYSTEM ONLINE
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-[9px] font-mono text-blue-400/60 uppercase tracking-widest">LIVE</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="section-label px-3 mb-3">// NAVIGATION</p>
        {sidebarNavItems.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.path;
          return (
            <Link key={item.label} to={item.path} className={`nav-link ${active ? 'active' : ''}`}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.badge > 0 && (
                <span className="badge">{item.badge > 99 ? '99+' : item.badge}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-app-border space-y-2 shrink-0">
        <ThemeToggle className="w-full" />
        <div
          className="relative flex items-center gap-3 p-3 border border-app-border bg-blue-950/30"
          style={{ clipPath: hexClipXl }}
        >
          <div
            className="h-9 w-9 border border-blue-500/40 flex items-center justify-center overflow-hidden shrink-0 relative"
            style={{ clipPath: hexClipSm }}
          >
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              : <UserIcon className="h-4 w-4 text-blue-400" />}
            {/* Online dot — clipped element can't show overflow, so place outside */}
          </div>
          {/* presence dot sits outside the clipped container */}
          <OnlineBadge userId={profile?.id} size="sm" className="absolute bottom-3 left-[46px] z-10" />
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-bold text-app-text-body truncate uppercase tracking-wide"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {profile?.full_name || 'OPERATOR'}
            </p>
            <p className="text-[10px] font-mono text-blue-400/60 truncate">{profile?.timezone || 'UTC'}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full btn-ghost flex items-center justify-center gap-2 px-4 py-2 text-xs hover:text-red-400 hover:border-red-500/30 cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          DISCONNECT
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-app-bg text-app-text-body flex flex-col md:flex-row">

      {/* ── Mobile top header ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-3 bg-app-panel border-b border-app-border md:hidden z-30 sticky top-0 relative">
        <div className="animate-scan-line" />
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div
            className="h-8 w-8 border border-blue-500/50 flex items-center justify-center relative shrink-0"
            style={{ clipPath: hexClipSm }}
          >
            <div className="absolute inset-0 bg-blue-600/15" />
            <Zap className="h-4 w-4 text-blue-400 relative z-10" />
          </div>
          <div>
            <span
              className="font-black text-sm text-app-text-body tracking-widest uppercase"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              StayTrue
            </span>
            <p className="text-[8px] font-mono text-blue-500/60 uppercase tracking-[0.2em] -mt-0.5 leading-none">
              ONLINE
            </p>
          </div>
        </div>
        {/* Right actions — fixed width to keep logo centered */}
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link
            to="/dashboard/notifications"
            className="relative flex items-center justify-center w-10 h-10 border border-transparent text-app-text-secondary hover:text-blue-400 hover:border-blue-500/30 hover:bg-blue-500/5 transition-all"
            style={{ clipPath: hexClipSm }}
            aria-label="Notifications"
          >
            <Bell className="h-[18px] w-[18px]" />
          </Link>
        </div>
      </header>

      {/* ── Desktop sidebar ───────────────────────────────────────────────── */}
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 bg-app-panel border-r border-app-border h-screen sticky top-0">
        <SidebarContent />
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-y-auto pb-20 md:pb-0">
        <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8">
          {children}
        </div>
      </main>

      {/* ── Mobile bottom nav ─────────────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-app-panel border-t border-app-border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Mobile navigation"
      >
        <div className="grid items-stretch" style={{ gridTemplateColumns: `repeat(${bottomNavItems.length}, 1fr)` }}>
          {bottomNavItems.map(({ label, path, icon: Icon, badge }) => {
            const active = isActive(path);
            return (
              <Link
                key={label}
                to={path}
                className={`relative flex flex-col items-center justify-center min-h-[58px] gap-1 transition-all duration-150 ${
                  active ? 'text-blue-400 bg-blue-950/40' : 'text-app-text-dim hover:text-app-text-secondary'
                }`}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
              >
                {active && <span className="absolute top-0 left-0 right-0 h-[2px] bg-blue-500" />}
                <span className="relative flex items-center justify-center w-10 h-6">
                  <Icon className={`h-[20px] w-[20px] transition-all ${active ? 'scale-110' : ''}`} />
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-1 badge" style={{ fontSize: '8px', padding: '1px 4px' }}>
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                <span className={`font-mono text-[9px] uppercase tracking-widest leading-none ${active ? 'font-bold' : ''}`}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

    </div>
  );
};
