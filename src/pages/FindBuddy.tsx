import React from 'react';
import { Users, Bell } from 'lucide-react';
import { BuddyRequestsInbox } from '../components/BuddyRequestsInbox';
import { BuddyManager } from '../components/BuddyManager';
import { useBuddyRequests } from '../hooks/useBuddies';

export const FindBuddy: React.FC = () => {
  const { data: pendingRequests = [] } = useBuddyRequests('incoming');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-app-text-body" style={{ fontFamily: 'var(--font-display)' }}>
          Find a Buddy
        </h1>
        <p className="text-sm text-app-text-secondary mt-0.5">
          Search for anyone and send a buddy request — just like on social media
        </p>
      </div>

      {/* How it works */}
      <div className="bg-app-panel border border-app-border rounded-xl p-5 flex gap-4 items-start">
        <div className="p-2.5 rounded-xl bg-app-accent-bg border border-app-border-active/20 shrink-0">
          <Users className="h-4 w-4 text-app-text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-app-text-body mb-1">How it works</p>
          <p className="text-sm text-app-text-secondary leading-relaxed">
            Search for anyone by username or email and send them a buddy request.
            Once they accept, you can message each other, challenge each other, and
            keep track of each other's streaks.
          </p>
        </div>
      </div>

      {/* Incoming requests */}
      {pendingRequests.length > 0 && (
        <div className="bg-app-panel border border-app-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="h-4 w-4 text-app-text-primary" />
            <h2 className="text-sm font-semibold text-app-text-body">Incoming requests</h2>
            <span className="badge ml-auto">{pendingRequests.length}</span>
          </div>
          <BuddyRequestsInbox />
        </div>
      )}

      {/* Search + buddy list */}
      <div className="bg-app-panel border border-app-border rounded-xl p-5">
        <BuddyManager />
      </div>
    </div>
  );
};
