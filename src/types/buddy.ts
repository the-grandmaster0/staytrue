import type { Profile } from '../store/useAuthStore';

export interface MatchingPoolEntry {
  id: string;
  user_id: string;
  goal_id: string;
  category: string;
  joined_at: string;
  is_matched: boolean;
}

export interface MatchBuddyResult {
  matched: boolean;
  buddy: Profile | null;
}

export interface BuddyRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  sender?: Profile;
  receiver?: Profile;
}

export interface Buddy {
  user_id: string;
  buddy_id: string;
  profile?: Profile;
}
