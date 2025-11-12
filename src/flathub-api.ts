/**
 * Flathub API Client
 * Wrapper around generated Orval client with convenience methods
 */

import {
  getAppstreamAppstreamAppIdGet,
  type GetAppstreamAppstreamAppIdGet200,
  getCategoriesCollectionCategoryGet,
  getSummarySummaryAppIdGet,
  type MeilisearchResponseAppsIndex,
  postSearchSearchPost,
  type SearchQuery,
  type SummaryResponse,
} from "./generated/flathub-api.ts";

// Re-export commonly used types with simpler names
export type AppstreamData = GetAppstreamAppstreamAppIdGet200;
export type SummaryData = SummaryResponse;
export type SearchResult = MeilisearchResponseAppsIndex;

export interface CategoryData {
  name: string;
  description?: string;
}

/**
 * Type guard to check if appstream has description
 */
function hasDescription(
  appstream: AppstreamData,
): appstream is Extract<AppstreamData, { description: string }> {
  return (
    "description" in appstream && typeof appstream.description === "string"
  );
}

/**
 * Safely get description from appstream data
 */
export function getDescription(appstream: AppstreamData): string | undefined {
  return hasDescription(appstream) ? appstream.description : undefined;
}

/**
 * Safely get keywords from appstream data
 */
export function getKeywords(appstream: AppstreamData): string[] | undefined {
  if ("keywords" in appstream && appstream.keywords) {
    const keywords = appstream.keywords as unknown;
    return Array.isArray(keywords) ? keywords : [];
  }
  return undefined;
}

export class FlathubAPI {
  /**
   * Fetch appstream data for a specific app
   * @param appId - The Flathub app ID (e.g., "org.mozilla.Firefox")
   * @returns Appstream data
   */
  async getAppstream(appId: string): Promise<AppstreamData> {
    try {
      const response = await getAppstreamAppstreamAppIdGet(appId);
      if (response.status === 200) {
        return response.data;
      }
      throw new Error(`Failed to fetch appstream data: ${response.status}`);
    } catch (error) {
      throw new Error(`Error fetching appstream data: ${error}`);
    }
  }

  /**
   * Get the VCS repository URL from appstream data
   * Checks multiple URL fields for repository links
   * @param appstream - Appstream data
   * @returns Repository URL or null
   */
  getRepositoryUrl(appstream: AppstreamData): string | null {
    if (!appstream.urls) {
      return null;
    }

    // Priority order: vcs_browser, homepage, bugtracker
    // vcs_browser is the most reliable for repository URLs
    if (appstream.urls.vcs_browser) {
      return appstream.urls.vcs_browser;
    }

    // Check homepage for common repository hosting patterns
    if (appstream.urls.homepage) {
      const homepage = appstream.urls.homepage.toLowerCase();
      if (
        homepage.includes("github.com") ||
        homepage.includes("gitlab.com") ||
        homepage.includes("codeberg.org") ||
        homepage.includes("bitbucket.org") ||
        homepage.includes("git.sr.ht")
      ) {
        return appstream.urls.homepage;
      }
    }

    // Check bugtracker as it's often the repository URL
    if (appstream.urls.bugtracker) {
      const bugtracker = appstream.urls.bugtracker.toLowerCase();
      if (
        bugtracker.includes("github.com") ||
        bugtracker.includes("gitlab.com") ||
        bugtracker.includes("codeberg.org") ||
        bugtracker.includes("bitbucket.org") ||
        bugtracker.includes("git.sr.ht")
      ) {
        // Extract base repository URL from issue tracker URLs
        // e.g., "https://github.com/user/repo/issues" -> "https://github.com/user/repo"
        const repoUrl = appstream.urls.bugtracker.replace(
          /\/(issues|bugs|tracker).*$/i,
          "",
        );
        return repoUrl;
      }
    }

    return null;
  }

  /**
   * Get the Flathub repository URL for an app
   * @param appId - The Flathub app ID
   * @returns Flathub repository URL
   */
  getFlathubRepoUrl(appId: string): string {
    return `https://github.com/flathub/${appId}`;
  }

  /**
   * Get download/install statistics for an app
   * @param appId - The Flathub app ID
   * @returns Summary data with install statistics
   */
  async getSummary(appId: string): Promise<SummaryData> {
    try {
      const response = await getSummarySummaryAppIdGet(appId);
      if (response.status === 200) {
        return response.data;
      }
      throw new Error(`Failed to fetch summary data: ${response.status}`);
    } catch (error) {
      throw new Error(`Error fetching summary data: ${error}`);
    }
  }

  /**
   * Search for apps on Flathub
   * @param query - Search query string
   * @param limit - Maximum number of results (default: 10)
   * @returns Search results
   */
  async search(query: string, limit: number = 10): Promise<SearchResult> {
    try {
      const searchQuery: SearchQuery = {
        query,
        hits_per_page: limit,
      };

      const response = await postSearchSearchPost(searchQuery);
      if (response.status === 200) {
        return response.data;
      }
      throw new Error(`Failed to search apps: ${response.status}`);
    } catch (error) {
      throw new Error(`Error searching apps: ${error}`);
    }
  }

  /**
   * Get all available categories on Flathub
   * @returns Array of category names
   */
  async getCategories(): Promise<string[]> {
    try {
      const response = await getCategoriesCollectionCategoryGet();
      if (response.status === 200) {
        return response.data;
      }
      throw new Error(`Failed to fetch categories: ${response.status}`);
    } catch (error) {
      throw new Error(`Error fetching categories: ${error}`);
    }
  }
}
