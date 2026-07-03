export type MessageType = 'text' | 'reaction';

export interface Message {
  id: string;
  goal_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  message_type: MessageType;
  reaction_key: string | null;
  created_at: string;
  read_at: string | null;
}

export interface ReactionOption {
  key: string;
  emoji: string;
  label: string;
}

export const REACTIONS: ReactionOption[] = [
  { key: 'on_fire',    emoji: '🔥', label: 'On Fire'      },
  { key: 'keep_going', emoji: '💪', label: 'Keep Going'   },
  { key: 'nailed_it',  emoji: '🎯', label: 'Nailed It'    },
  { key: 'dont_quit',  emoji: '😤', label: "Don't Quit"   },
  { key: 'beast_mode', emoji: '⚡', label: 'Beast Mode'   },
  { key: 'proud',      emoji: '🙌', label: 'Proud of You' },
];
