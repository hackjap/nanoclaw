import { Version3Client, HttpException } from 'jira.js';
import { readEnvFile } from './env.js';
import { JIRA_PROJECT_KEY } from './config.js';
import { logger } from './logger.js';

// --- Internal ADF types ---

interface AdfDocument {
  type: 'doc';
  version: 1;
  content: AdfNode[];
}

interface AdfNode {
  type: string;
  content?: AdfNode[];
  text?: string;
}

// --- Exported types ---

export interface JiraError {
  category: 'auth' | 'api' | 'network';
  userMessage: string;
  details: string;
}

export interface JiraCreateResult {
  key: string;
  url: string;
}

export interface JiraDraftData {
  title: string;
  description: string;
  issueType: 'Bug' | 'Task' | 'Story';
}

// --- Internal helpers ---

/** Convert plain text to Atlassian Document Format (ADF). */
export function textToAdf(text: string): AdfDocument {
  const paragraphs = text.split('\n\n').filter(Boolean);
  return {
    type: 'doc',
    version: 1,
    content: paragraphs.map((para) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: para }],
    })),
  };
}

let client: Version3Client | null = null;
let jiraHost = '';

function getClient(): Version3Client {
  if (!client) {
    const secrets = readEnvFile(['JIRA_HOST', 'JIRA_EMAIL', 'JIRA_API_TOKEN']);
    if (!secrets.JIRA_HOST || !secrets.JIRA_EMAIL || !secrets.JIRA_API_TOKEN) {
      throw new Error(
        'Jira credentials not configured in .env (JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN)',
      );
    }
    jiraHost = secrets.JIRA_HOST.replace(/\/+$/, '');
    client = new Version3Client({
      host: jiraHost,
      authentication: {
        basic: {
          email: secrets.JIRA_EMAIL,
          apiToken: secrets.JIRA_API_TOKEN,
        },
      },
    });
  }
  return client;
}

// --- Exported functions ---

/** Classify a Jira API error into auth, api, or network category with Korean user message. */
export function classifyError(err: unknown): JiraError {
  if (err instanceof HttpException) {
    const status = (err as HttpException & { status?: number }).status;
    if (status === 401 || status === 403) {
      return {
        category: 'auth',
        userMessage: 'Jira 인증에 실패했습니다. 관리자에게 문의해주세요.',
        details: err.message,
      };
    }
    return {
      category: 'api',
      userMessage: `Jira 이슈 생성에 실패했습니다: ${err.message}`,
      details: `HTTP ${status}: ${err.message}`,
    };
  }
  return {
    category: 'network',
    userMessage: 'Jira 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.',
    details: err instanceof Error ? err.message : String(err),
  };
}

/** @internal - Reset client singleton for testing. */
export function _resetClient(): void {
  client = null;
  jiraHost = '';
}

/** Create a Jira issue from draft data. Retries once on network errors only. */
export async function createJiraIssue(
  draft: JiraDraftData,
): Promise<JiraCreateResult | JiraError> {
  let jiraClient: Version3Client;
  try {
    jiraClient = getClient();
  } catch (err: unknown) {
    return classifyError(err);
  }

  const fields = {
    project: { key: JIRA_PROJECT_KEY },
    summary: draft.title,
    issuetype: { name: draft.issueType },
    description: textToAdf(draft.description),
  };

  const attemptCreate = async (): Promise<JiraCreateResult | JiraError> => {
    try {
      const result = await jiraClient.issues.createIssue({ fields });
      return {
        key: result.key!,
        url: `${jiraHost}/browse/${result.key}`,
      };
    } catch (err: unknown) {
      return classifyError(err);
    }
  };

  const result = await attemptCreate();

  // Retry once on network error only (per D-14)
  if ('category' in result && result.category === 'network') {
    logger.warn(
      { details: result.details },
      'Jira network error, retrying once',
    );
    return attemptCreate();
  }

  return result;
}
