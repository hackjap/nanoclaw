import { logger } from './logger.js';

/** Target message for emoji reactions. */
export interface ReactionTarget {
  channel: string; // Slack channel ID (no 'slack:' prefix)
  timestamp: string; // Message ts to react on
}

/** Lifecycle stages of a status reaction flow. */
export type ReactionStage = 'idle' | 'received' | 'processing' | 'completed' | 'failed';

/** Emoji used for each non-idle stage. */
export const STAGE_EMOJI: Record<Exclude<ReactionStage, 'idle'>, string> = {
  received: 'eyes',
  processing: 'gear',
  completed: 'white_check_mark',
  failed: 'x',
};

/** Callbacks injected into StatusReaction for Slack API interaction. */
export interface StatusReactionCallbacks {
  addReaction: (channel: string, ts: string, emoji: string) => Promise<void>;
  removeReaction: (channel: string, ts: string, emoji: string) => Promise<void>;
  sendStatusMessage?: (channel: string, threadTs: string, text: string) => Promise<void>;
}

// Stage ordering for forward-only transitions
const STAGE_ORDER: Record<ReactionStage, number> = {
  idle: 0,
  received: 1,
  processing: 2,
  completed: 3,
  failed: 3,
};

const DEFAULT_STATUS_MESSAGE_DELAY_MS = 10000;

/**
 * Forward-only emoji state machine for bot liveness feedback.
 *
 * Transitions: idle -> received -> processing -> completed | failed
 * Each transition removes the previous stage emoji and adds the new one.
 * Errors from Slack API calls are logged but never re-thrown.
 */
export class StatusReaction {
  private currentStage: ReactionStage = 'idle';
  private statusMessageTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly target: ReactionTarget,
    private readonly callbacks: StatusReactionCallbacks,
    private readonly statusMessageDelayMs: number = DEFAULT_STATUS_MESSAGE_DELAY_MS,
  ) {}

  /** Transition to received stage. Adds eyes emoji. */
  async received(): Promise<void> {
    await this.transition('received');
  }

  /** Transition to processing stage. Adds gear emoji and starts status message timer. */
  async processing(): Promise<void> {
    const previousStage = this.currentStage;
    await this.transition('processing');

    // Only start timer if we actually transitioned
    if (previousStage !== this.currentStage && this.callbacks.sendStatusMessage) {
      this.statusMessageTimer = setTimeout(() => {
        this.callbacks
          .sendStatusMessage!(this.target.channel, this.target.timestamp, 'Working on it...')
          .catch((err: unknown) => {
            logger.warn({ err }, 'Failed to send status message');
          });
      }, this.statusMessageDelayMs);
    }
  }

  /** Transition to completed stage. Cancels pending status message. */
  async completed(): Promise<void> {
    this.cancelStatusMessage();
    await this.transition('completed');
  }

  /** Transition to failed stage. Cancels pending status message. */
  async failed(): Promise<void> {
    this.cancelStatusMessage();
    await this.transition('failed');
  }

  /** Clear the pending status message timer if set. */
  private cancelStatusMessage(): void {
    if (this.statusMessageTimer !== null) {
      clearTimeout(this.statusMessageTimer);
      this.statusMessageTimer = null;
    }
  }

  /**
   * Execute a forward-only stage transition.
   * If the target stage is not ahead of the current stage, this is a no-op.
   */
  private async transition(to: ReactionStage): Promise<void> {
    if (STAGE_ORDER[to] <= STAGE_ORDER[this.currentStage]) return;

    const previousStage = this.currentStage;

    // Remove previous emoji (skip for idle — nothing to remove)
    if (previousStage !== 'idle') {
      const prevEmoji = STAGE_EMOJI[previousStage as Exclude<ReactionStage, 'idle'>];
      try {
        await this.callbacks.removeReaction(this.target.channel, this.target.timestamp, prevEmoji);
      } catch (err: unknown) {
        logger.warn(
          { channel: this.target.channel, ts: this.target.timestamp, emoji: prevEmoji, err },
          'Failed to remove reaction',
        );
      }
    }

    // Add new emoji
    const newEmoji = STAGE_EMOJI[to as Exclude<ReactionStage, 'idle'>];
    try {
      await this.callbacks.addReaction(this.target.channel, this.target.timestamp, newEmoji);
    } catch (err: unknown) {
      logger.warn(
        { channel: this.target.channel, ts: this.target.timestamp, emoji: newEmoji, err },
        'Failed to add reaction',
      );
    }

    this.currentStage = to;
  }
}
