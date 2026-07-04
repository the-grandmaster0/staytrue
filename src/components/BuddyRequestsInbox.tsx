import React from 'react';
import { Loader2, Users, CheckCircle2, XCircle, Inbox } from 'lucide-react';
import { useBuddyRequests, useRespondBuddyRequest } from '../hooks/useBuddies';

export const BuddyRequestsInbox: React.FC = () => {
  const { data: requests = [], isLoading } = useBuddyRequests('incoming');
  const respondMutation = useRespondBuddyRequest();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-app-text-primary" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="border border-app-border border-dashed rounded-xl p-8 text-center">
        <Inbox className="h-8 w-8 text-app-text-dim mx-auto mb-2" />
        <p className="text-sm font-medium text-app-text-secondary">No pending requests</p>
        <p className="text-xs text-app-text-dim mt-1">Buddy invitations will appear here</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {requests.map((req) => {
        const isProcessing = respondMutation.isPending && respondMutation.variables?.requestId === req.id;
        const senderName = req.sender?.full_name || req.sender?.username || req.sender?.email || 'Someone';

        return (
          <li key={req.id} className="flex flex-col sm:flex-row sm:items-center gap-3 bg-app-bg border border-app-border rounded-xl p-4 animate-fade-in">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="h-9 w-9 rounded-full bg-app-accent-bg border border-app-border flex items-center justify-center shrink-0 overflow-hidden">
                {req.sender?.avatar_url
                  ? <img src={req.sender.avatar_url} alt={senderName} className="h-full w-full object-cover" />
                  : <Users className="h-4 w-4 text-app-text-primary" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-app-text-body truncate">{senderName}</p>
                {req.sender?.username && (
                  <p className="text-xs text-app-text-dim truncate">@{req.sender.username}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => respondMutation.mutate({ requestId: req.id, status: 'accepted' })}
                disabled={isProcessing}
                className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-sm cursor-pointer disabled:opacity-50"
                aria-label="Accept"
              >
                {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Accept
              </button>
              <button
                onClick={() => respondMutation.mutate({ requestId: req.id, status: 'declined' })}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 bg-red-500/5 hover:bg-red-500/15 text-sm transition-all cursor-pointer disabled:opacity-50"
                aria-label="Decline"
              >
                <XCircle className="h-3.5 w-3.5" />
                Decline
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
};
