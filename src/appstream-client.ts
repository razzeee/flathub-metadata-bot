import { type Document, DOMParser } from "@b-fuze/deno-dom";

export const DEFAULT_APPSTREAM_URL =
  "https://dl.flathub.org/repo/appstream/x86_64/appstream.xml.gz";

export interface AppstreamData {
  id: string;
  type: "desktop" | "addon" | "console-application" | "generic";
  name: string;
  summary: string;
  description?: string;
  project_license?: string;
  developer_name?: string;
  urls?: Record<string, string>;
  keywords?: string[];
  categories?: string[];
  icon?: string;
  is_free_license: boolean;
  bundle: { value: string; type: string };
  releases: unknown[];
}

/**
 * Type guard to check if appstream has description
 */
function hasDescription(
  appstream: AppstreamData,
): appstream is AppstreamData & { description: string } {
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
    return appstream.keywords;
  }
  return undefined;
}

export class AppStreamClient {
  private appstreamXml: Document | null = null;
  private appstreamUrl: string;

  constructor(appstreamUrl: string = DEFAULT_APPSTREAM_URL) {
    this.appstreamUrl = appstreamUrl;
  }

  /**
   * Check if using the default Flathub AppStream URL
   * @returns true if using the default URL, false otherwise
   */
  isUsingDefaultUrl(): boolean {
    return this.appstreamUrl === DEFAULT_APPSTREAM_URL;
  }

  private async fetchAppstreamXml(): Promise<Document> {
    if (this.appstreamXml) {
      return this.appstreamXml;
    }

    const response = await fetch(this.appstreamUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch appstream XML: ${response.status} ${response.statusText}`,
      );
    }

    if (!response.body) {
      throw new Error("Appstream XML response body is empty");
    }

    const decompressedStream = response.body.pipeThrough(
      new DecompressionStream("gzip"),
    );
    const text = await new Response(decompressedStream).text();
    const doc = new DOMParser().parseFromString(text, "text/html");

    if (!doc) {
      throw new Error("Failed to parse appstream XML");
    }

    this.appstreamXml = doc;
    return doc;
  }

  private findAppInXml(doc: Document, appId: string): AppstreamData {
    const components = doc.getElementsByTagName("component");
    for (const component of components) {
      const idElement = component.querySelector("id");
      if (idElement?.textContent === appId) {
        const type = component.getAttribute("type") || "desktop";
        const name = component.querySelector("name")?.textContent || "";
        const summary = component.querySelector("summary")?.textContent || "";

        // Handle description (can be HTML-like)
        const descriptionEl = component.querySelector("description");
        let description = "";
        if (descriptionEl) {
          // Basic innerHTML extraction or text content depending on need.
          // For now, let's try to reconstruct it or just take text if simple.
          // Actually, generated types expect a string.
          // descriptionEl.innerHTML might be what we want if deno-dom supports it properly for XML,
          // otherwise we might need to serialize children.
          // Let's use innerHTML for now as it's most likely to preserve tags.
          description = descriptionEl.innerHTML;
        }

        const project_license = component.querySelector("project_license")
          ?.textContent || undefined;

        const developer_name = component.querySelector("developer_name")
          ?.textContent || undefined;

        const urlElements = component.querySelectorAll("url");
        const urls: Record<string, string> = {};
        for (const url of urlElements) {
          const type = url.getAttribute("type");
          if (type && url.textContent) {
            urls[type] = url.textContent;
          }
        }

        // Keywords
        const keywordsEl = component.querySelector("keywords");
        let keywords: string[] | undefined;
        if (keywordsEl) {
          keywords = Array.from(keywordsEl.querySelectorAll("keyword"))
            .map((k: unknown) =>
              (k as { textContent: string | null }).textContent
            )
            .filter((k): k is string => k !== null);
        }

        // Categories
        const categoriesEl = component.querySelector("categories");
        let categories: string[] | undefined;
        if (categoriesEl) {
          categories = Array.from(categoriesEl.querySelectorAll("category"))
            .map((c: unknown) =>
              (c as { textContent: string | null }).textContent
            )
            .filter((c): c is string => c !== null);
        }

        // Icon
        // XML might have multiple icons, we usually want the cached one or remote.
        // For simplicity, let's look for one.
        const iconEl = component.querySelector("icon[type='cached']");
        const icon = iconEl?.textContent
          ? `https://dl.flathub.org/repo/appstream/x86_64/icons/128x128/${iconEl.textContent}`
          : undefined;

        // Construct the object matching AppstreamData (DesktopAppstream et al)
        // Note: This is a partial mapping. We might need more fields if the bot uses them.
        // Based on usage in main.ts: name, summary, description, keywords, urls (vcs_browser, homepage, bugtracker)

        const appData: AppstreamData = {
          id: appId,
          type: type as AppstreamData["type"],
          name,
          summary,
          description,
          project_license,
          developer_name,
          urls: Object.keys(urls).length > 0 ? urls : undefined,
          keywords,
          categories,
          icon,
          is_free_license: false, // Default, hard to determine from XML without license parsing logic
          bundle: { value: "", type: "" }, // Placeholder
          releases: [], // Placeholder
        };

        return appData as AppstreamData;
      }
    }
    throw new Error(`App ${appId} not found in appstream XML`);
  }

  /**
   * Fetch appstream data for a specific app
   * @param appId - The Flathub app ID (e.g., "org.mozilla.Firefox")
   * @returns Appstream data
   */
  async getAppstream(appId: string): Promise<AppstreamData> {
    try {
      const doc = await this.fetchAppstreamXml();
      return this.findAppInXml(doc, appId);
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
}
