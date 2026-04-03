import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock logger
vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  StatusReaction,
  ReactionTarget,
  ReactionStage,
  STAGE_EMOJI,
  StatusReactionCallbacks,
} from './status-reactions.js';
import { logger } from './logger.js';

// --- Test helpers ---

function createTarget(overrides?: Partial<ReactionTarget>): ReactionTarget {
  return {
    channel: 'C0123456789',
    timestamp: '1704067200.000000',
    ...overrides,
  };
}

function createCallbacks(
  overrides?: Partial<StatusReactionCallbacks>,
): StatusReactionCallbacks {
  return {
    addReaction: vi.fn().mockResolvedValue(undefined),
    removeReaction: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// --- Tests ---

describe('StatusReaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at idle stage', () => {
    const target = createTarget();
    const callbacks = createCallbacks();
    const reaction = new StatusReaction(target, callbacks);

    // No reactions should be added on construction
    expect(callbacks.addReaction).not.toHaveBeenCalled();
    expect(callbacks.removeReaction).not.toHaveBeenCalled();
  });

  it('received() transitions idle->received, adds eyes emoji', async () => {
    const target = createTarget();
    const callbacks = createCallbacks();
    const reaction = new StatusReaction(target, callbacks);

    await reaction.received();

    expect(callbacks.addReaction).toHaveBeenCalledWith(
      'C0123456789',
      '1704067200.000000',
      'eyes',
    );
  });

  it('processing() transitions received->processing, removes eyes and adds gear', async () => {
    const target = createTarget();
    const callbacks = createCallbacks();
    const reaction = new StatusReaction(target, callbacks);

    await reaction.received();
    vi.clearAllMocks();

    await reaction.processing();

    expect(callbacks.removeReaction).toHaveBeenCalledWith(
      'C0123456789',
      '1704067200.000000',
      'eyes',
    );
    expect(callbacks.addReaction).toHaveBeenCalledWith(
      'C0123456789',
      '1704067200.000000',
      'gear',
    );
  });

  it('completed() transitions processing->completed, removes gear and adds white_check_mark', async () => {
    const target = createTarget();
    const callbacks = createCallbacks();
    const reaction = new StatusReaction(target, callbacks);

    await reaction.received();
    await reaction.processing();
    vi.clearAllMocks();

    await reaction.completed();

    expect(callbacks.removeReaction).toHaveBeenCalledWith(
      'C0123456789',
      '1704067200.000000',
      'gear',
    );
    expect(callbacks.addReaction).toHaveBeenCalledWith(
      'C0123456789',
      '1704067200.000000',
      'white_check_mark',
    );
  });

  it('failed() transitions processing->failed, removes gear and adds x', async () => {
    const target = createTarget();
    const callbacks = createCallbacks();
    const reaction = new StatusReaction(target, callbacks);

    await reaction.received();
    await reaction.processing();
    vi.clearAllMocks();

    await reaction.failed();

    expect(callbacks.removeReaction).toHaveBeenCalledWith(
      'C0123456789',
      '1704067200.000000',
      'gear',
    );
    expect(callbacks.addReaction).toHaveBeenCalledWith(
      'C0123456789',
      '1704067200.000000',
      'x',
    );
  });

  it('failed() from received stage removes eyes and adds x', async () => {
    const target = createTarget();
    const callbacks = createCallbacks();
    const reaction = new StatusReaction(target, callbacks);

    await reaction.received();
    vi.clearAllMocks();

    await reaction.failed();

    expect(callbacks.removeReaction).toHaveBeenCalledWith(
      'C0123456789',
      '1704067200.000000',
      'eyes',
    );
    expect(callbacks.addReaction).toHaveBeenCalledWith(
      'C0123456789',
      '1704067200.000000',
      'x',
    );
  });

  it('calling processing() twice only transitions once (idempotent)', async () => {
    const target = createTarget();
    const callbacks = createCallbacks();
    const reaction = new StatusReaction(target, callbacks);

    await reaction.received();
    await reaction.processing();
    vi.clearAllMocks();

    await reaction.processing();

    // Should be a no-op — no add/remove calls
    expect(callbacks.addReaction).not.toHaveBeenCalled();
    expect(callbacks.removeReaction).not.toHaveBeenCalled();
  });

  it('calling received() after processing() is a no-op (forward-only)', async () => {
    const target = createTarget();
    const callbacks = createCallbacks();
    const reaction = new StatusReaction(target, callbacks);

    await reaction.received();
    await reaction.processing();
    vi.clearAllMocks();

    await reaction.received();

    // Should be a no-op — can't go backwards
    expect(callbacks.addReaction).not.toHaveBeenCalled();
    expect(callbacks.removeReaction).not.toHaveBeenCalled();
  });

  it('if addReaction throws, the error is logged but not re-thrown', async () => {
    const target = createTarget();
    const callbacks = createCallbacks({
      addReaction: vi.fn().mockRejectedValue(new Error('Slack API error')),
    });
    const reaction = new StatusReaction(target, callbacks);

    // Should not throw
    await expect(reaction.received()).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.any(String),
    );
  });

  it('if removeReaction throws, the error is logged but not re-thrown', async () => {
    const target = createTarget();
    const callbacks = createCallbacks({
      removeReaction: vi.fn().mockRejectedValue(new Error('Slack API error')),
    });
    const reaction = new StatusReaction(target, callbacks);

    await reaction.received();
    vi.clearAllMocks();

    // Should not throw even though removeReaction fails
    await expect(reaction.processing()).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.any(String),
    );
  });

  it('processing() with sendStatusMessage sends text after delay', async () => {
    const target = createTarget();
    const sendStatusMessage = vi.fn().mockResolvedValue(undefined);
    const callbacks = createCallbacks({ sendStatusMessage });
    const reaction = new StatusReaction(target, callbacks, 5000);

    await reaction.received();
    await reaction.processing();

    // Before delay — should not have sent
    expect(sendStatusMessage).not.toHaveBeenCalled();

    // Advance past the delay
    vi.advanceTimersByTime(5000);

    // Allow the promise to resolve
    await vi.runAllTimersAsync();

    expect(sendStatusMessage).toHaveBeenCalledWith(
      'C0123456789',
      '1704067200.000000',
      expect.any(String),
    );
  });

  it('completed() before delay elapses cancels the pending status message', async () => {
    const target = createTarget();
    const sendStatusMessage = vi.fn().mockResolvedValue(undefined);
    const callbacks = createCallbacks({ sendStatusMessage });
    const reaction = new StatusReaction(target, callbacks, 5000);

    await reaction.received();
    await reaction.processing();

    // Complete before the timer fires
    await reaction.completed();

    // Advance past the original delay
    vi.advanceTimersByTime(10000);
    await vi.runAllTimersAsync();

    // Should NOT have sent status message
    expect(sendStatusMessage).not.toHaveBeenCalled();
  });

  it('failed() before delay elapses cancels the pending status message', async () => {
    const target = createTarget();
    const sendStatusMessage = vi.fn().mockResolvedValue(undefined);
    const callbacks = createCallbacks({ sendStatusMessage });
    const reaction = new StatusReaction(target, callbacks, 5000);

    await reaction.received();
    await reaction.processing();

    // Fail before the timer fires
    await reaction.failed();

    // Advance past the original delay
    vi.advanceTimersByTime(10000);
    await vi.runAllTimersAsync();

    // Should NOT have sent status message
    expect(sendStatusMessage).not.toHaveBeenCalled();
  });

  // --- STAGE_EMOJI constant ---

  it('exports correct STAGE_EMOJI mapping', () => {
    expect(STAGE_EMOJI).toEqual({
      received: 'eyes',
      processing: 'gear',
      completed: 'white_check_mark',
      failed: 'x',
    });
  });
});
