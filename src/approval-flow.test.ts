import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildDraftPreviewBlocks,
  buildSuccessBlocks,
  handleDraftApprove,
  handleDraftEdit,
  sendDraftPreview,
  initApprovalFlow,
} from './approval-flow.js';
import type { ActionPayload } from './channels/slack.js';
import type { JiraDraft } from './types.js';

function makeDraftRow(overrides: Partial<JiraDraft> = {}): JiraDraft {
  return {
    thread_ts: '1234.5678',
    chat_jid: 'slack:C123',
    draft: JSON.stringify({ title: 'Fix login', description: 'Short desc', issueType: 'Bug' }),
    status: 'draft',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeApprovePayload(threadTs = '1234.5678'): ActionPayload {
  return {
    action: { action_id: 'draft_approve', type: 'button', value: threadTs },
    body: {
      channel: { id: 'C123' },
      message: { ts: '9999.0001' },
    },
    respond: vi.fn().mockResolvedValue(undefined),
  };
}

function makeEditPayload(threadTs = '1234.5678'): ActionPayload {
  return {
    action: { action_id: 'draft_edit', type: 'button', value: threadTs },
    body: {
      channel: { id: 'C123' },
      message: { ts: '9999.0001' },
    },
    respond: vi.fn().mockResolvedValue(undefined),
  };
}

describe('buildDraftPreviewBlocks', () => {
  it('returns array with header, fields, description, and actions blocks', () => {
    const blocks = buildDraftPreviewBlocks(
      { title: 'Fix login', description: 'Short desc', issueType: 'Bug' },
      '1234.5678',
    );
    expect(blocks).toHaveLength(4);

    // Header section
    expect(blocks[0]).toMatchObject({
      type: 'section',
      text: { type: 'mrkdwn', text: expect.stringContaining('Jira 이슈 초안') },
    });

    // Fields section with title and type
    expect(blocks[1]).toMatchObject({
      type: 'section',
      fields: expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining('Fix login') }),
        expect.objectContaining({ text: expect.stringContaining('Bug') }),
      ]),
    });

    // Description section
    expect(blocks[2]).toMatchObject({
      type: 'section',
      text: { type: 'mrkdwn', text: expect.stringContaining('Short desc') },
    });

    // Actions with Approve (primary) and Edit buttons
    expect(blocks[3]).toMatchObject({
      type: 'actions',
      elements: expect.arrayContaining([
        expect.objectContaining({
          action_id: 'draft_approve',
          style: 'primary',
          value: '1234.5678',
        }),
        expect.objectContaining({
          action_id: 'draft_edit',
          value: '1234.5678',
        }),
      ]),
    });
  });

  it('truncates description longer than 200 chars', () => {
    const longDesc = 'a'.repeat(250);
    const blocks = buildDraftPreviewBlocks(
      { title: 'Test', description: longDesc, issueType: 'Task' },
      '1234.5678',
    );
    const descBlock = blocks[2] as { type: string; text: { text: string } };
    expect(descBlock.text.text).toContain('a'.repeat(200) + '...');
    expect(descBlock.text.text).not.toContain('a'.repeat(201));
  });

  it('does NOT truncate description exactly 200 chars', () => {
    const exactDesc = 'b'.repeat(200);
    const blocks = buildDraftPreviewBlocks(
      { title: 'Test', description: exactDesc, issueType: 'Task' },
      '1234.5678',
    );
    const descBlock = blocks[2] as { type: string; text: { text: string } };
    expect(descBlock.text.text).toContain(exactDesc);
    expect(descBlock.text.text).not.toContain('...');
  });
});

describe('buildSuccessBlocks', () => {
  it('returns section with mrkdwn text containing link and title', () => {
    const blocks = buildSuccessBlocks(
      'PROJ-123',
      'https://jira.example.com/browse/PROJ-123',
      'Fix login',
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: expect.stringContaining('<https://jira.example.com/browse/PROJ-123|PROJ-123>'),
      },
    });
    expect((blocks[0] as any).text.text).toContain('Fix login');
    expect((blocks[0] as any).text.text).toContain('Jira 이슈 생성 완료');
  });
});

describe('handleDraftApprove', () => {
  let deps: any;

  beforeEach(() => {
    deps = {
      getDraft: vi.fn(),
      updateDraftStatus: vi.fn(),
      createJiraIssue: vi.fn(),
      updateMessage: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('creates Jira issue on valid draft and updates preview with success', async () => {
    deps.getDraft.mockReturnValue(makeDraftRow());
    deps.createJiraIssue.mockResolvedValue({
      key: 'PROJ-42',
      url: 'https://jira.example.com/browse/PROJ-42',
    });

    await handleDraftApprove(makeApprovePayload(), deps);

    expect(deps.updateDraftStatus).toHaveBeenCalledWith('1234.5678', 'approved');
    expect(deps.createJiraIssue).toHaveBeenCalledWith({
      title: 'Fix login',
      description: 'Short desc',
      issueType: 'Bug',
    });
    expect(deps.updateDraftStatus).toHaveBeenCalledWith('1234.5678', 'created');
    expect(deps.updateMessage).toHaveBeenCalledWith(
      'C123',
      '9999.0001',
      expect.any(String),
      expect.any(Array),
    );
  });

  it('returns early without calling createJiraIssue when status is not draft (double-click guard)', async () => {
    deps.getDraft.mockReturnValue(makeDraftRow({ status: 'approved' }));

    await handleDraftApprove(makeApprovePayload(), deps);

    expect(deps.createJiraIssue).not.toHaveBeenCalled();
  });

  it('reverts status to draft and posts error on Jira API failure', async () => {
    deps.getDraft.mockReturnValue(makeDraftRow());
    deps.createJiraIssue.mockResolvedValue({
      category: 'api',
      userMessage: 'Jira 이슈 생성에 실패했습니다',
      details: 'HTTP 400',
    });

    await handleDraftApprove(makeApprovePayload(), deps);

    expect(deps.updateDraftStatus).toHaveBeenCalledWith('1234.5678', 'draft');
    expect(deps.sendMessage).toHaveBeenCalledWith(
      'C123',
      expect.stringContaining('Jira 이슈 생성에 실패했습니다'),
      expect.objectContaining({ thread_ts: '1234.5678' }),
    );
  });

  it('returns early when no draft found', async () => {
    deps.getDraft.mockReturnValue(undefined);

    await handleDraftApprove(makeApprovePayload(), deps);

    expect(deps.createJiraIssue).not.toHaveBeenCalled();
  });
});

describe('handleDraftEdit', () => {
  let deps: any;

  beforeEach(() => {
    deps = {
      getDraft: vi.fn(),
      editCallback: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('calls editCallback with draft data when draft exists', async () => {
    deps.getDraft.mockReturnValue(makeDraftRow());

    await handleDraftEdit(makeEditPayload(), deps);

    expect(deps.editCallback).toHaveBeenCalledWith(
      'slack:C123',
      '1234.5678',
      { title: 'Fix login', description: 'Short desc', issueType: 'Bug' },
      '9999.0001',
    );
  });

  it('returns early when no draft found', async () => {
    deps.getDraft.mockReturnValue(undefined);

    await handleDraftEdit(makeEditPayload(), deps);

    expect(deps.editCallback).not.toHaveBeenCalled();
  });
});

describe('sendDraftPreview', () => {
  it('calls sendBlockMessage with built blocks', async () => {
    const sendBlockMessage = vi.fn().mockResolvedValue('msg.ts');

    await sendDraftPreview(
      '1234.5678',
      'slack:C123',
      { title: 'Fix login', description: 'Short desc', issueType: 'Bug' },
      { sendBlockMessage },
    );

    expect(sendBlockMessage).toHaveBeenCalledWith(
      'slack:C123',
      'Jira 이슈 초안 미리보기',
      expect.objectContaining({
        thread_ts: '1234.5678',
        blocks: expect.any(Array),
      }),
    );
  });
});

describe('initApprovalFlow', () => {
  it('registers draft_approve and draft_edit handlers', () => {
    const onAction = vi.fn();
    const channel = { onAction };
    const deps = {} as any;

    initApprovalFlow(channel, deps);

    expect(onAction).toHaveBeenCalledWith('draft_approve', expect.any(Function));
    expect(onAction).toHaveBeenCalledWith('draft_edit', expect.any(Function));
  });
});
