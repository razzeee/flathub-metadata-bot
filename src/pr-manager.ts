/**
 * Pull Request Manager
 * Creates pull requests on GitHub, GitLab (including custom instances), and Codeberg
 */

export type GitPlatform = "github" | "gitlab" | "codeberg";

export interface RepoMetadata {
  platform: GitPlatform;
  hostname: string;
  owner: string;
  repo: string;
}

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
  private gitlabTokens: Map<string, string>;
  private codebergToken?: string;

  constructor(
    githubToken?: string,
    gitlabTokens?: Map<string, string> | string,
    codebergToken?: string,
  ) {
    this.githubToken = githubToken;
    // Support both Map and single string for backwards compatibility
    if (typeof gitlabTokens === "string") {
      this.gitlabTokens = new Map([["gitlab.com", gitlabTokens]]);
    } else {
      this.gitlabTokens = gitlabTokens || new Map();
    }
    this.codebergToken = codebergToken;
  }

  /**
   * Get the appropriate GitLab token for a given hostname
   */
  private getGitLabToken(hostname: string): string | undefined {
    return this.gitlabTokens.get(hostname);
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
        `Failed to create GitHub PR: ${response.status} ${error}`,
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
        `Failed to fetch user: ${resp.status} ${await resp.text()}`,
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
   * Parse repository URL and detect platform
   * Supports GitHub, GitLab (gitlab.com and custom instances), and Codeberg
   */
  parseRepoUrl(repoUrl: string): RepoMetadata {
    try {
      const url = new URL(repoUrl);
      const hostname = url.hostname;

      // Remove leading slash and .git suffix from pathname
      const pathParts = url.pathname
        .split("/")
        .filter(Boolean) // remove empty segments
        .map((part) => part.replace(/\.git$/, "")); // remove .git suffix

      if (pathParts.length < 2) {
        throw new Error(`Invalid repository URL format: ${repoUrl}`);
      }

      const owner = pathParts[0];
      const repo = pathParts[1];

      // Detect platform
      if (hostname === "github.com") {
        return { platform: "github", hostname, owner, repo };
      } else if (hostname === "codeberg.org") {
        return { platform: "codeberg", hostname, owner, repo };
      } else if (
        hostname.includes("gitlab") ||
        hostname === "invent.kde.org" // KDE's GitLab instance
      ) {
        // Matches gitlab.com, gitlab.gnome.org, gitlab.freedesktop.org, invent.kde.org, etc.
        return { platform: "gitlab", hostname, owner, repo };
      }

      throw new Error(
        `Unsupported git hosting platform: ${hostname}. Supported platforms: GitHub, GitLab, Codeberg`,
      );
    } catch (error) {
      throw new Error(
        `Failed to parse repository URL: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Parse a GitHub repository URL and return owner & repo (supports dots in repo name)
   * @deprecated Use parseRepoUrl() instead for platform-agnostic parsing
   */
  parseGitHubRepoUrl(repoUrl: string): { owner: string; repo: string } {
    const parsed = this.parseRepoUrl(repoUrl);
    if (parsed.platform !== "github") {
      throw new Error(`Not a GitHub URL: ${repoUrl}`);
    }
    return { owner: parsed.owner, repo: parsed.repo };
  }

  /** Fetch repository metadata (e.g. default branch) */
  async getGitHubRepoMetadata(
    repoUrl: string,
  ): Promise<{ default_branch: string }> {
    if (!this.githubToken) throw new Error("GitHub token not configured");
    const { owner, repo } = this.parseGitHubRepoUrl(repoUrl);
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const resp = await fetch(apiUrl, {
      headers: {
        Authorization: `token ${this.githubToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!resp.ok) {
      throw new Error(
        `Failed to fetch repo metadata: ${resp.status} ${await resp.text()}`,
      );
    }
    const data = await resp.json();
    return { default_branch: data.default_branch || "main" };
  }

  /**
   * Get authenticated GitLab user username
   */
  async getGitLabUser(hostname: string): Promise<string> {
    const token = this.getGitLabToken(hostname);
    if (!token) {
      throw new Error(`GitLab token not configured for ${hostname}`);
    }
    const apiUrl = `https://${hostname}/api/v4/user`;
    const resp = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!resp.ok) {
      throw new Error(
        `Failed to fetch GitLab user: ${resp.status} ${await resp.text()}`,
      );
    }
    const data = await resp.json();
    return data.username;
  }

  /**
   * Fork a GitLab repository (if not already forked)
   * @returns fork owner's username
   */
  async forkGitLabRepo(repoUrl: string): Promise<string> {
    const { hostname, owner, repo } = this.parseRepoUrl(repoUrl);
    if (!hostname.includes("gitlab")) {
      throw new Error(`Not a GitLab URL: ${repoUrl}`);
    }

    const token = this.getGitLabToken(hostname);
    if (!token) {
      throw new Error(`GitLab token not configured for ${hostname}`);
    }

    // First, get the current user to check if fork already exists
    const userLogin = await this.getGitLabUser(hostname);

    // Check if fork already exists
    const forkPath = encodeURIComponent(`${userLogin}/${repo}`);
    const checkForkUrl = `https://${hostname}/api/v4/projects/${forkPath}`;
    const checkResp = await fetch(checkForkUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (checkResp.ok) {
      // Fork already exists
      const forkData = await checkResp.json();
      // Verify it's actually a fork of the target project
      if (forkData.forked_from_project) {
        return userLogin;
      }
    }

    // Fork doesn't exist, create it
    const projectPath = encodeURIComponent(`${owner}/${repo}`);
    const apiUrl = `https://${hostname}/api/v4/projects/${projectPath}/fork`;

    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!resp.ok) {
      const txt = await resp.text();
      // If it's a 409 (already exists), that's actually OK - just return the user
      if (resp.status === 409) {
        return userLogin;
      }
      throw new Error(`Failed to fork GitLab repo: ${resp.status} ${txt}`);
    }

    const data = await resp.json();
    return data.owner?.username || data.namespace?.path || userLogin;
  }

  /**
   * Fetch GitLab repository metadata (e.g. default branch)
   */
  async getGitLabRepoMetadata(
    repoUrl: string,
  ): Promise<{ default_branch: string }> {
    const { hostname, owner, repo } = this.parseRepoUrl(repoUrl);
    if (!hostname.includes("gitlab")) {
      throw new Error(`Not a GitLab URL: ${repoUrl}`);
    }

    const token = this.getGitLabToken(hostname);
    if (!token) {
      throw new Error(`GitLab token not configured for ${hostname}`);
    }

    const projectPath = encodeURIComponent(`${owner}/${repo}`);
    const apiUrl = `https://${hostname}/api/v4/projects/${projectPath}`;

    const resp = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!resp.ok) {
      throw new Error(
        `Failed to fetch GitLab repo metadata: ${resp.status} ${await resp
          .text()}`,
      );
    }
    const data = await resp.json();
    return { default_branch: data.default_branch || "main" };
  }

  /**
   * Create a merge request on GitLab (supports custom instances)
   * @param repoUrl - Repository URL (gitlab.com, gitlab.gnome.org, invent.kde.org, etc.)
   * @param options - MR options
   * @returns MR URL
   */
  async createGitLabMR(repoUrl: string, options: PROptions): Promise<string> {
    const { hostname, owner, repo } = this.parseRepoUrl(repoUrl);
    if (!hostname.includes("gitlab")) {
      throw new Error(`Not a GitLab URL: ${repoUrl}`);
    }

    const token = this.getGitLabToken(hostname);
    if (!token) {
      throw new Error(`GitLab token not configured for ${hostname}`);
    }

    // Parse headOverride to determine if this is from a fork
    let sourceProjectPath: string;
    let sourceBranch: string;
    let targetProjectPath: string;

    if (options.headOverride) {
      // Format: "forkOwner:branchName"
      const [forkOwner, branch] = options.headOverride.split(":");
      sourceProjectPath = encodeURIComponent(`${forkOwner}/${repo}`);
      sourceBranch = branch;
      targetProjectPath = encodeURIComponent(`${owner}/${repo}`);
    } else {
      // No fork, same project
      sourceProjectPath = encodeURIComponent(`${owner}/${repo}`);
      sourceBranch = options.branchName;
      targetProjectPath = sourceProjectPath;
    }

    // Get the source project ID (from fork)
    const sourceProjectApiUrl =
      `https://${hostname}/api/v4/projects/${sourceProjectPath}`;
    const sourceResp = await fetch(sourceProjectApiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!sourceResp.ok) {
      throw new Error(
        `Failed to fetch source project: ${sourceResp.status} ${await sourceResp
          .text()}`,
      );
    }
    const sourceProject = await sourceResp.json();
    const sourceProjectId = sourceProject.id;

    // If creating from fork, we need the target project ID
    if (options.headOverride) {
      // Get target project ID
      const targetProjectApiUrl =
        `https://${hostname}/api/v4/projects/${targetProjectPath}`;
      const targetResp = await fetch(targetProjectApiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!targetResp.ok) {
        throw new Error(
          `Failed to fetch target project: ${targetResp.status} ${await targetResp
            .text()}`,
        );
      }
      const targetProject = await targetResp.json();

      // Create MR from fork to upstream
      const forkMRBody = {
        source_branch: sourceBranch,
        target_branch: options.baseBranch || "main",
        title: options.title,
        description: options.description,
        target_project_id: targetProject.id,
      };

      // Create MR from the source (fork) project
      const forkMRUrl =
        `https://${hostname}/api/v4/projects/${sourceProjectId}/merge_requests`;
      const response = await fetch(forkMRUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(forkMRBody),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(
          `Failed to create GitLab MR from fork: ${response.status} ${error}`,
        );
      }

      const data = await response.json();
      return data.web_url;
    }

    // Direct MR (no fork) - create in the same project
    const apiUrl =
      `https://${hostname}/api/v4/projects/${targetProjectPath}/merge_requests`;

    const directMRBody = {
      source_branch: sourceBranch,
      target_branch: options.baseBranch || "main",
      title: options.title,
      description: options.description,
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(directMRBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Failed to create GitLab MR: ${response.status} ${error}`,
      );
    }

    const data = await response.json();
    return data.web_url;
  }

  /**
   * Get authenticated Codeberg user login
   */
  async getCodebergUser(): Promise<string> {
    if (!this.codebergToken) throw new Error("Codeberg token not configured");
    const resp = await fetch("https://codeberg.org/api/v1/user", {
      headers: {
        Authorization: `token ${this.codebergToken}`,
      },
    });
    if (!resp.ok) {
      throw new Error(
        `Failed to fetch Codeberg user: ${resp.status} ${await resp.text()}`,
      );
    }
    const data = await resp.json();
    return data.login;
  }

  /**
   * Fork a Codeberg repository (if not already forked)
   * @returns fork owner's login
   */
  async forkCodebergRepo(repoUrl: string): Promise<string> {
    if (!this.codebergToken) {
      throw new Error("Codeberg token not configured");
    }
    const { owner, repo } = this.parseRepoUrl(repoUrl);

    const apiUrl = `https://codeberg.org/api/v1/repos/${owner}/${repo}/forks`;
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `token ${this.codebergToken}`,
      },
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Failed to fork Codeberg repo: ${resp.status} ${txt}`);
    }
    const data = await resp.json();
    return data.owner?.login || "";
  }

  /**
   * Fetch Codeberg repository metadata (e.g. default branch)
   */
  async getCodebergRepoMetadata(
    repoUrl: string,
  ): Promise<{ default_branch: string }> {
    if (!this.codebergToken) {
      throw new Error("Codeberg token not configured");
    }
    const { owner, repo } = this.parseRepoUrl(repoUrl);
    const apiUrl = `https://codeberg.org/api/v1/repos/${owner}/${repo}`;
    const resp = await fetch(apiUrl, {
      headers: {
        Authorization: `token ${this.codebergToken}`,
      },
    });
    if (!resp.ok) {
      throw new Error(
        `Failed to fetch Codeberg repo metadata: ${resp.status} ${await resp
          .text()}`,
      );
    }
    const data = await resp.json();
    return { default_branch: data.default_branch || "main" };
  }

  /**
   * Create a pull request on Codeberg (uses Gitea API)
   * @param repoUrl - Repository URL
   * @param options - PR options
   * @returns PR URL
   */
  async createCodebergPR(repoUrl: string, options: PROptions): Promise<string> {
    if (!this.codebergToken) {
      throw new Error("Codeberg token not configured");
    }

    const { owner, repo } = this.parseRepoUrl(repoUrl);

    // Create PR using Gitea API
    const apiUrl = `https://codeberg.org/api/v1/repos/${owner}/${repo}/pulls`;

    const body = {
      title: options.title,
      body: options.description,
      head: options.headOverride || options.branchName,
      base: options.baseBranch || "main",
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `token ${this.codebergToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Failed to create Codeberg PR: ${response.status} ${error}`,
      );
    }

    const data = await response.json();
    return data.html_url;
  }

  /**
   * Detect platform and create appropriate PR/MR
   * @param repoUrl - Repository URL
   * @param options - PR/MR options
   * @returns PR/MR URL
   */
  async createPR(repoUrl: string, options: PROptions): Promise<string> {
    const { platform } = this.parseRepoUrl(repoUrl);

    switch (platform) {
      case "github":
        return await this.createGitHubPR(repoUrl, options);
      case "gitlab":
        return await this.createGitLabMR(repoUrl, options);
      case "codeberg":
        return await this.createCodebergPR(repoUrl, options);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }
}
