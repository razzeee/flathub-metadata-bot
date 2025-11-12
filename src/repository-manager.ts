/**
 * Repository Manager
 * Handles cloning repos and finding metadata files
 */

import { exists } from "@std/fs";
import { join } from "@std/path";

export interface MetadataFile {
  path: string;
  type: "desktop" | "metainfo" | "appdata";
  content: string;
  isTemplate?: boolean;
}

export class RepositoryManager {
  private workDir = "./cloned_repos";

  constructor() {
    // Ensure work directory exists
    Deno.mkdir(this.workDir, { recursive: true }).catch(() => {});
  }

  /**
   * Clone a repository
   * @param repoUrl - Git repository URL
   * @param appId - App ID for naming the directory
   * @returns Path to cloned repository
   */
  async cloneRepository(repoUrl: string, appId: string): Promise<string> {
    const repoPath = join(this.workDir, appId.replace(/\./g, "_"));

    // Remove existing directory if it exists
    if (await exists(repoPath)) {
      await Deno.remove(repoPath, { recursive: true });
    }

    // Clone repository
    const command = new Deno.Command("git", {
      args: ["clone", "--depth", "1", repoUrl, repoPath],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stderr } = await command.output();

    if (code !== 0) {
      const errorMsg = new TextDecoder().decode(stderr);
      throw new Error(`Failed to clone repository: ${errorMsg}`);
    }

    return repoPath;
  }

  /**
   * Find metadata files in the repository
   * @param repoPath - Path to repository
   * @param appId - App ID to look for
   * @returns Array of metadata files
   */
  async findMetadataFiles(
    repoPath: string,
    appId: string,
  ): Promise<MetadataFile[]> {
    const files: MetadataFile[] = [];

    // Extract the app name from app ID (e.g., "tv.kodi.Kodi" -> "kodi")
    const appName = appId.split(".").pop()?.toLowerCase() || "";

    // Common patterns including .in templates
    const patterns = [
      // Exact matches with app ID
      `${appId}.desktop`,
      `${appId}.desktop.in`,
      `${appId}.metainfo.xml`,
      `${appId}.metainfo.xml.in`,
      `${appId}.appdata.xml`,
      `${appId}.appdata.xml.in`,
      // Matches with app name
      `${appName}.desktop`,
      `${appName}.desktop.in`,
      `${appName}.metainfo.xml`,
      `${appName}.metainfo.xml.in`,
      `${appName}.appdata.xml`,
      `${appName}.appdata.xml.in`,
      // Generic patterns
      "*.desktop",
      "*.desktop.in",
      "*.metainfo.xml",
      "*.metainfo.xml.in",
      "*.appdata.xml",
      "*.appdata.xml.in",
    ];

    const foundPaths = new Set<string>();

    // Search for files using find command
    for (const pattern of patterns) {
      const command = new Deno.Command("find", {
        args: [repoPath, "-name", pattern, "-type", "f"],
        stdout: "piped",
        stderr: "piped",
      });

      const { stdout } = await command.output();
      const output = new TextDecoder().decode(stdout).trim();

      if (output) {
        const paths = output.split("\n");
        for (const path of paths) {
          if (!path || foundPaths.has(path)) continue;
          foundPaths.add(path);

          const content = await Deno.readTextFile(path);
          let type: "desktop" | "metainfo" | "appdata" = "desktop";
          const isTemplate = path.endsWith(".in");

          // Determine type based on filename
          if (path.includes(".metainfo.xml")) {
            type = "metainfo";
          } else if (path.includes(".appdata.xml")) {
            type = "appdata";
          }

          files.push({ path, type, content, isTemplate });
        }
      }
    }

    return files;
  }

  /**
   * Create a new branch in the repository
   * @param repoPath - Path to repository
   * @param branchName - Name of the new branch
   */
  async createBranch(repoPath: string, branchName: string): Promise<void> {
    const command = new Deno.Command("git", {
      args: ["-C", repoPath, "checkout", "-b", branchName],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stderr } = await command.output();

    if (code !== 0) {
      const errorMsg = new TextDecoder().decode(stderr);
      throw new Error(`Failed to create branch: ${errorMsg}`);
    }
  }

  /**
   * Commit changes in the repository
   * @param repoPath - Path to repository
   * @param message - Commit message
   */
  async commitChanges(repoPath: string, message: string): Promise<void> {
    // Add all changes
    let command = new Deno.Command("git", {
      args: ["-C", repoPath, "add", "-A"],
      stdout: "piped",
      stderr: "piped",
    });

    await command.output();

    // Commit
    command = new Deno.Command("git", {
      args: ["-C", repoPath, "commit", "-m", message],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stderr } = await command.output();

    if (code !== 0) {
      const errorMsg = new TextDecoder().decode(stderr);
      throw new Error(`Failed to commit changes: ${errorMsg}`);
    }
  }
}
