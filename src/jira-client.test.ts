import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException } from 'jira.js';

// Mock jira.js Version3Client
const mockCreateIssue = vi.fn();
vi.mock('jira.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('jira.js')>();
  class MockVersion3Client {
    issues = { createIssue: mockCreateIssue };
  }
  return {
    ...original,
    Version3Client: MockVersion3Client,
  };
});

// Mock env.ts to provide test credentials
vi.mock('./env.js', () => ({
  readEnvFile: vi.fn().mockReturnValue({
    JIRA_HOST: 'https://test.atlassian.net',
    JIRA_EMAIL: 'test@example.com',
    JIRA_API_TOKEN: 'test-token',
  }),
}));

// Mock config.ts
vi.mock('./config.js', () => ({
  JIRA_PROJECT_KEY: 'TEST',
}));

// Mock logger.ts
vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

// Import after mocks
import {
  createJiraIssue,
  classifyError,
  textToAdf,
  _resetClient,
} from './jira-client.js';

beforeEach(() => {
  _resetClient();
});

describe('textToAdf', () => {
  it('converts single paragraph text to ADF', () => {
    const result = textToAdf('Hello world');
    expect(result).toEqual({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello world' }],
        },
      ],
    });
  });

  it('converts multi-paragraph text to ADF with separate paragraph nodes', () => {
    const result = textToAdf('Para one\n\nPara two');
    expect(result).toEqual({
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Para one' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Para two' }],
        },
      ],
    });
  });

  it('returns empty content array for empty text', () => {
    const result = textToAdf('');
    expect(result).toEqual({
      type: 'doc',
      version: 1,
      content: [],
    });
  });

  it('filters out empty paragraphs from double newlines', () => {
    const result = textToAdf('Para one\n\n\n\nPara two');
    expect(result.content).toHaveLength(2);
  });
});

describe('classifyError', () => {
  it('classifies 401 HttpException as auth error', () => {
    const err = new HttpException('Unauthorized', 401);
    const result = classifyError(err);
    expect(result.category).toBe('auth');
    expect(result.userMessage).toContain('Jira 인증에 실패했습니다');
  });

  it('classifies 403 HttpException as auth error', () => {
    const err = new HttpException('Forbidden', 403);
    const result = classifyError(err);
    expect(result.category).toBe('auth');
  });

  it('classifies 400 HttpException as api error', () => {
    const err = new HttpException('Bad Request', 400);
    const result = classifyError(err);
    expect(result.category).toBe('api');
    expect(result.userMessage).toContain('Jira 이슈 생성에 실패했습니다');
  });

  it('classifies 500 HttpException as api error', () => {
    const err = new HttpException('Server Error', 500);
    const result = classifyError(err);
    expect(result.category).toBe('api');
  });

  it('classifies generic Error with ECONNREFUSED as network error', () => {
    const err = new Error('connect ECONNREFUSED');
    (err as NodeJS.ErrnoException).code = 'ECONNREFUSED';
    const result = classifyError(err);
    expect(result.category).toBe('network');
    expect(result.userMessage).toContain('Jira 서버에 연결할 수 없습니다');
  });

  it('classifies unknown error as network error', () => {
    const result = classifyError('something went wrong');
    expect(result.category).toBe('network');
  });
});

describe('createJiraIssue', () => {
  beforeEach(() => {
    mockCreateIssue.mockReset();
  });

  it('calls createIssue with correct fields and returns result', async () => {
    mockCreateIssue.mockResolvedValue({ key: 'TEST-123' });

    const result = await createJiraIssue({
      title: 'Test Issue',
      description: 'Issue description',
      issueType: 'Task',
    });

    expect(mockCreateIssue).toHaveBeenCalledWith({
      fields: {
        project: { key: 'TEST' },
        summary: 'Test Issue',
        issuetype: { name: 'Task' },
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Issue description' }],
            },
          ],
        },
      },
    });

    expect(result).toEqual({
      key: 'TEST-123',
      url: 'https://test.atlassian.net/browse/TEST-123',
    });
  });

  it('retries once on network error then returns error', async () => {
    const networkErr = new Error('connect ECONNREFUSED');
    (networkErr as NodeJS.ErrnoException).code = 'ECONNREFUSED';
    mockCreateIssue.mockRejectedValue(networkErr);

    const result = await createJiraIssue({
      title: 'Test',
      description: 'desc',
      issueType: 'Bug',
    });

    // Should have been called twice (original + 1 retry)
    expect(mockCreateIssue).toHaveBeenCalledTimes(2);
    expect(result).toHaveProperty('category', 'network');
  });

  it('does NOT retry on auth error', async () => {
    const authErr = new HttpException('Unauthorized', 401);
    mockCreateIssue.mockRejectedValue(authErr);

    const result = await createJiraIssue({
      title: 'Test',
      description: 'desc',
      issueType: 'Story',
    });

    expect(mockCreateIssue).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('category', 'auth');
  });

  it('does NOT retry on api error', async () => {
    const apiErr = new HttpException('Bad Request', 400);
    mockCreateIssue.mockRejectedValue(apiErr);

    const result = await createJiraIssue({
      title: 'Test',
      description: 'desc',
      issueType: 'Task',
    });

    expect(mockCreateIssue).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('category', 'api');
  });
});
