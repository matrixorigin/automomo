export interface GitHubClientOptions {
  fetchImpl?: typeof fetch;
  token?: string;
}

export class GitHubClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GitHubClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async fetchIssue(input: { owner: string; repo: string; number: number }) {
    return this.fetchJson(`https://api.github.com/repos/${input.owner}/${input.repo}/issues/${input.number}`);
  }

  async fetchPullRequest(input: { owner: string; repo: string; number: number }) {
    return this.fetchJson(`https://api.github.com/repos/${input.owner}/${input.repo}/pulls/${input.number}`);
  }

  private async fetchJson(url: string) {
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "user-agent": "automomo"
    };
    if (this.options.token) {
      headers.authorization = `Bearer ${this.options.token}`;
    }
    const response = await this.fetchImpl(url, { headers });
    if (!response.ok) {
      throw new Error(`GitHub request failed with ${response.status}`);
    }
    return response.json() as Promise<any>;
  }
}

export function normalizeGitHubWorkItem(input: {
  event: "issues" | "pull_request";
  owner: string;
  repo: string;
  number: number;
  codebaseId: string;
  payload: any;
}) {
  const sourceUrl = input.payload.html_url;
  return {
    codebaseId: input.codebaseId,
    connector: {
      type: "github",
      id: `${input.owner}/${input.repo}#${input.event}:${input.number}`,
      url: sourceUrl,
      metadata: {
        owner: input.owner,
        repo: input.repo,
        issueNumber: input.event === "issues" ? input.number : undefined,
        pullRequestNumber: input.event === "pull_request" ? input.number : undefined,
        nodeId: input.payload.node_id,
        state: input.payload.state,
        author: input.payload.user?.login,
        updatedAt: input.payload.updated_at,
        sourceUrl
      }
    },
    title: input.payload.title,
    body: input.payload.body ?? "",
    labels: Array.isArray(input.payload.labels) ? input.payload.labels.map((label: any) => label.name).filter(Boolean) : [],
    priority: "medium" as const,
    source: "webhook" as const,
    metadata: {}
  };
}
