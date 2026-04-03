// Stub — will be implemented in GREEN phase

export interface ReactionTarget {
  channel: string;
  timestamp: string;
}

export type ReactionStage = 'idle' | 'received' | 'processing' | 'completed' | 'failed';

export const STAGE_EMOJI: Record<Exclude<ReactionStage, 'idle'>, string> = {
  received: 'eyes',
  processing: 'gear',
  completed: 'white_check_mark',
  failed: 'x',
};

export interface StatusReactionCallbacks {
  addReaction: (channel: string, ts: string, emoji: string) => Promise<void>;
  removeReaction: (channel: string, ts: string, emoji: string) => Promise<void>;
  sendStatusMessage?: (channel: string, threadTs: string, text: string) => Promise<void>;
}

export class StatusReaction {
  constructor(
    _target: ReactionTarget,
    _callbacks: StatusReactionCallbacks,
    _statusMessageDelayMs?: number,
  ) {}

  async received(): Promise<void> {}
  async processing(): Promise<void> {}
  async completed(): Promise<void> {}
  async failed(): Promise<void> {}
}
