import type { ActionPayload, ActionHandler, ReactionPayload, ReactionHandler } from './channels/slack.js';
import type { JiraDraftData, JiraCreateResult, JiraError } from './jira-client.js';
import type { JiraDraft, SendMessageOptions } from './types.js';
import { StatusReaction } from './status-reactions.js';
import { logger } from './logger.js';

// --- Dependency interfaces ---

export interface ApprovalDeps {
  getDraft: (threadTs: string) => JiraDraft | undefined;
  updateDraftStatus: (threadTs: string, status: JiraDraft['status']) => void;
  createJiraIssue: (draft: JiraDraftData) => Promise<JiraCreateResult | JiraError>;
  updateMessage: (channelId: string, ts: string, text: string, blocks: unknown[]) => Promise<void>;
  sendMessage: (jid: string, text: string, options?: SendMessageOptions) => Promise<void>;
}

export interface EditDeps {
  getDraft: (threadTs: string) => JiraDraft | undefined;
  editCallback: (
    chatJid: string,
    threadTs: string,
    draftData: JiraDraftData,
    previewMessageTs: string | undefined,
  ) => Promise<void>;
}

export interface PreviewDeps {
  sendBlockMessage: (
    jid: string,
    text: string,
    options: SendMessageOptions & { blocks: unknown[] },
  ) => Promise<string | undefined>;
}

export interface ReactionDeps {
  fetchMessage: (channelId: string, ts: string) => Promise<string | undefined>;
  enqueueForAgent: (channelId: string, threadTs: string, contextText: string) => Promise<void>;
  addReaction: (channelId: string, ts: string, emoji: string) => Promise<void>;
  removeReaction: (channelId: string, ts: string, emoji: string) => Promise<void>;
  sendMessage: (jid: string, text: string, options?: SendMessageOptions) => Promise<void>;
}

export type FullDeps = ApprovalDeps & EditDeps & ReactionDeps;

// --- Block Kit builders ---

/** Build Block Kit blocks for the Jira draft preview message (D-01). */
export function buildDraftPreviewBlocks(
  draft: { title: string; description: string; issueType: string },
  threadTs: string,
): unknown[] {
  const truncatedDesc =
    draft.description.length > 200
      ? draft.description.slice(0, 200) + '...'
      : draft.description;

  return [
    // Header section
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*Jira 이슈 초안*' },
    },
    // Fields: title + type
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*제목:*\n${draft.title}` },
        { type: 'mrkdwn', text: `*타입:*\n${draft.issueType}` },
      ],
    },
    // Description
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*설명:*\n${truncatedDesc}` },
    },
    // Action buttons
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve' },
          action_id: 'draft_approve',
          style: 'primary',
          value: threadTs,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Edit' },
          action_id: 'draft_edit',
          value: threadTs,
        },
      ],
    },
  ];
}

/** Build Block Kit blocks for Jira issue creation success message (D-07). */
export function buildSuccessBlocks(
  issueKey: string,
  issueUrl: string,
  title: string,
): unknown[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Jira 이슈 생성 완료*\n<${issueUrl}|${issueKey}> - ${title}`,
      },
    },
  ];
}

// --- Action handlers ---

/** Handle Approve button click: create Jira issue and update preview (D-07, D-08). */
export async function handleDraftApprove(
  payload: ActionPayload,
  deps: ApprovalDeps,
): Promise<void> {
  const threadTs = payload.action.value as string;
  const channelId = (payload.body as any).channel?.id as string | undefined;
  const previewMessageTs = (payload.body as any).message?.ts as string | undefined;

  const draftRow = deps.getDraft(threadTs);
  if (!draftRow || draftRow.status !== 'draft') {
    logger.warn({ threadTs, status: draftRow?.status }, 'Draft not found or already processed');
    return;
  }

  // Lock immediately to prevent double-click (Pitfall 4)
  deps.updateDraftStatus(threadTs, 'approved');

  const draftData = JSON.parse(draftRow.draft) as JiraDraftData;
  const result = await deps.createJiraIssue(draftData);

  if ('key' in result) {
    // Success: update preview with success blocks (no action buttons)
    deps.updateDraftStatus(threadTs, 'created');
    const successText = `Jira 이슈 생성 완료: ${result.key}`;
    const successBlocks = buildSuccessBlocks(result.key, result.url, draftData.title);

    if (channelId && previewMessageTs) {
      await deps.updateMessage(channelId, previewMessageTs, successText, successBlocks);
    }
  } else {
    // Error: revert status for retry, post error in thread (D-08)
    deps.updateDraftStatus(threadTs, 'draft');
    const errorMsg = `Jira 이슈 생성 실패: ${(result as JiraError).userMessage}`;

    if (channelId) {
      await deps.sendMessage(channelId, errorMsg, { thread_ts: threadTs });
    }
  }
}

/** Handle Edit button click: re-invoke agent with draft context (D-03). */
export async function handleDraftEdit(
  payload: ActionPayload,
  deps: EditDeps,
): Promise<void> {
  const threadTs = payload.action.value as string;
  const previewMessageTs = (payload.body as any).message?.ts as string | undefined;

  const draftRow = deps.getDraft(threadTs);
  if (!draftRow) {
    logger.warn({ threadTs }, 'Draft not found for edit');
    return;
  }

  const draftData = JSON.parse(draftRow.draft) as JiraDraftData;
  await deps.editCallback(draftRow.chat_jid, threadTs, draftData, previewMessageTs);
}

// --- Preview sender ---

/** Send Block Kit draft preview into the thread (called from IPC after draft save). */
export async function sendDraftPreview(
  threadTs: string,
  chatJid: string,
  draft: JiraDraftData,
  deps: PreviewDeps,
): Promise<void> {
  const blocks = buildDraftPreviewBlocks(draft, threadTs);
  await deps.sendBlockMessage(chatJid, 'Jira 이슈 초안 미리보기', {
    thread_ts: threadTs,
    blocks,
  });
}

// --- Reaction handler ---

/** Handle :jira: emoji reaction: fetch reacted-to message and start AI conversation (D-05). */
export async function handleJiraReaction(
  payload: ReactionPayload,
  deps: ReactionDeps,
): Promise<void> {
  const { event } = payload;
  const channelId = event.item.channel;
  const messageTs = event.item.ts;

  // Per D-02: all triggers get liveness reactions
  const statusReaction = new StatusReaction(
    { channel: channelId, timestamp: messageTs },
    {
      addReaction: (ch, ts, emoji) => deps.addReaction(ch, ts, emoji),
      removeReaction: (ch, ts, emoji) => deps.removeReaction(ch, ts, emoji),
      sendStatusMessage: (ch, ts, text) =>
        deps.sendMessage(`slack:${ch}`, text, { thread_ts: ts }),
    },
  );

  await statusReaction.received(); // eyes emoji immediately

  const messageText = await deps.fetchMessage(channelId, messageTs);
  if (!messageText) {
    logger.warn({ channelId, messageTs }, 'Could not fetch reacted-to message');
    await statusReaction.failed(); // X emoji on fetch failure
    return;
  }

  await statusReaction.processing(); // gear emoji before agent enqueue

  try {
    await deps.enqueueForAgent(channelId, messageTs, messageText);
    await statusReaction.completed(); // checkmark after successful enqueue
  } catch (err) {
    logger.error({ channelId, messageTs, err }, 'Failed to enqueue for agent');
    await statusReaction.failed(); // X on enqueue failure
  }
}

// --- Initialization ---

/** Register approval flow action and reaction handlers on the Slack channel. */
export function initApprovalFlow(
  channel: {
    onAction: (id: string, handler: ActionHandler) => void;
    onReaction: (emoji: string, handler: ReactionHandler) => void;
  },
  deps: FullDeps,
): void {
  channel.onAction('draft_approve', (payload) => handleDraftApprove(payload, deps));
  channel.onAction('draft_edit', (payload) => handleDraftEdit(payload, deps));
  channel.onReaction('jira', (payload) => handleJiraReaction(payload, deps));
}
