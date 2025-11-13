/**
 * Pull Request Manager
 * Creates pull requests on GitHub and GitLab
 */

export interface PROptions {
  title: string;
  description: string;
  branchName: string;
  baseBranch?: string;
  /** Optional override for head reference (e.g. user:branch when from fork) */
  headOverride?: string;
}

export class PRManager {
  private githubToken?: string;
  private gitlabToken?: string;

  constructor(githubToken?: string, gitlabToken?: string) {
    this.githubToken = githubToken;
    this.gitlabToken = gitlabToken;
  }

  /**
   * Create a pull request on GitHub
   * @param repoUrl - Repository URL (e.g., https://github.com/owner/repo)
   * @param options - PR options
   * @returns PR URL
   */
  async createGitHubPR(repoUrl: string, options: PROptions): Promise<string> {
    if (!this.githubToken) {
      throw new Error("GitHub token not configured");
    }

    const { owner, repo } = this.parseGitHubRepoUrl(repoUrl);

    // Create PR using GitHub API
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/pulls`;

    const body = {
      title: options.title,
      body: options.description,
      head: options.headOverride || options.branchName,
      base: options.baseBranch || "main",
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `token ${this.githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Failed to create GitHub PR: ${response.status} ${error}`
      );
    }

    const data = await response.json();
    return data.html_url;
  }

  /**
   * Get authenticated GitHub user login
   */
  async getGitHubUser(): Promise<string> {
    if (!this.githubToken) throw new Error("GitHub token not configured");
    const resp = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${this.githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!resp.ok) {
      throw new Error(
        `Failed to fetch user: ${resp.status} ${await resp.text()}`
      );
    }
    const data = await resp.json();
    return data.login;
  }

  /**
   * Fork a GitHub repository (if not already forked)
   * @returns fork owner's login
   */
  async forkGitHubRepo(repoUrl: string): Promise<string> {
    if (!this.githubToken) throw new Error("GitHub token not configured");
    const { owner, repo } = this.parseGitHubRepoUrl(repoUrl);

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/forks`;
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `token ${this.githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Failed to fork repo: ${resp.status} ${txt}`);
    }
    const data = await resp.json();
    return data.owner?.login || "";
  }

  /**
   * Parse a GitHub repository URL and return owner & repo (supports dots in repo name)
   */
  parseGitHubRepoUrl(repoUrl: string): { owner: string; repo: string } {
    // Robust URL parsing instead of regex to avoid truncating at first '.'
    let url: URL;
    try {
      url = new URL(repoUrl);
    } catch (_) {
      throw new Error(`Invalid GitHub repository URL: ${repoUrl}`);
    }
    if (url.hostname !== "github.com") {
      throw new Error(`Not a GitHub URL: ${repoUrl}`);
    }
    const parts = url.pathname.split("/").filter(Boolean); // remove empty segments
    if (parts.length < 2) {
      throw new Error(`Incomplete GitHub repository path: ${repoUrl}`);
    }
    const owner = parts[0];
    let repo = parts[1];
    if (repo.endsWith(".git")) repo = repo.slice(0, -4);
    return { owner, repo };
  }

  /**
   * Create a merge request on GitLab
   * @param repoUrl - Repository URL
   * @param options - MR options
   * @returns MR URL
   */
  async createGitLabMR(repoUrl: string, options: PROptions): Promise<string> {
    if (!this.gitlabToken) {
      throw new Error("GitLab token not configured");
    }

    // Extract project path from URL
    const match = repoUrl.match(/gitlab\.com\/(.+?)(?:\.git)?$/);
    if (!match) {
      throw new Error("Invalid GitLab repository URL");
    }

    const projectPath = encodeURIComponent(match[1]);

    // Create MR using GitLab API
    const apiUrl = `https://gitlab.com/api/v4/projects/${projectPath}/merge_requests`;

    const body = {
      source_branch: options.branchName,
      target_branch: options.baseBranch || "main",
      title: options.title,
      description: options.description,
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.gitlabToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Failed to create GitLab MR: ${response.status} ${error}`
      );
    }

    const data = await response.json();
    return data.web_url;
  }

  /**
   * Detect if repository is GitHub or GitLab and create appropriate PR/MR
   * @param repoUrl - Repository URL
   * @param options - PR/MR options
   * @returns PR/MR URL
   */
  async createPR(repoUrl: string, options: PROptions): Promise<string> {
    if (repoUrl.includes("github.com")) {
      return await this.createGitHubPR(repoUrl, options);
    } else if (repoUrl.includes("gitlab.com")) {
      return await this.createGitLabMR(repoUrl, options);
    } else {
      throw new Error("Unsupported repository hosting platform");
    }
  }
}
