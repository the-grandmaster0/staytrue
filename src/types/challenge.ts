import type { Profile } from '../store/useAuthStore';

export type ChallengeStatus = 'pending' | 'active' | 'completed' | 'declined';
export type ChallengeDuration = 7 | 14 | 30;
export type ChallengeCategory = 'fitness' | 'learning' | 'mindfulness' | 'finance' | 'career' | 'other';

export interface Challenge {
  id: string;
  challenger_id: string;
  opponent_id: string;
  category: ChallengeCategory;
  duration_days: ChallengeDuration;
  start_date: string | null;
  end_date: string | null;
  status: ChallengeStatus;
  challenger_score: number;
  opponent_score: number;
  winner_id: string | null;
  created_at: string;
  // joined from profiles
  challenger?: Profile;
  opponent?: Profile;
}
