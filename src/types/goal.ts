export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: 'fitness' | 'learning' | 'mindfulness' | 'finance' | 'career' | 'other';
  frequency: 'daily' | 'three_per_week' | 'weekly';
  target_date: string | null;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
}
