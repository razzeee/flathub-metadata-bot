/**
 * File Patcher
 * Updates keywords, summaries, and descriptions in .desktop and .metainfo.xml files
 */

import type { MetadataFile } from "./repository-manager.ts";

export type PatchType = "keywords" | "summary" | "description";

export class FilePatcher {
  /**
   * Patch keywords into a metadata file
   * @param file - Metadata file to patch
   * @param keywords - Keywords to add
   * @returns Updated file content
   */
  patchKeywords(file: MetadataFile, keywords: string[]): string {
    if (file.type === "desktop") {
      return this.patchDesktopFile(file.content, keywords);
    } else {
      return this.patchKeywordsXml(file.content, keywords);
    }
  }

  /**
   * Patch summary into an appstream metadata file
   * Note: Summaries are only patched in XML files (appstream), not desktop files
   * @param file - Metadata file to patch
   * @param summary - Summary text to add
   * @returns Updated file content
   */
  patchSummary(file: MetadataFile, summary: string): string {
    if (file.type === "desktop") {
      console.warn(
        "  ⚠️  Skipping desktop file - summaries only added to appstream files",
      );
      return file.content;
    }
    return this.patchSummaryXml(file.content, summary);
  }

  /**
   * Patch description into an appstream metadata file
   * Note: Descriptions are only patched in XML files (appstream), not desktop files
   * @param file - Metadata file to patch
   * @param description - Description text to add
   * @returns Updated file content
   */
  patchDescription(file: MetadataFile, description: string): string {
    if (file.type === "desktop") {
      console.warn(
        "  ⚠️  Skipping desktop file - descriptions only added to appstream files",
      );
      return file.content;
    }
    return this.patchDescriptionXml(file.content, description);
  }

  /**
   * Patch keywords in a .desktop file
   * @param content - File content
   * @param keywords - Keywords to add
   * @returns Updated content
   */
  private patchDesktopFile(content: string, keywords: string[]): string {
    const keywordLine = `Keywords=${keywords.join(";")};`;

    // Check if Keywords line already exists
    const keywordRegex = /^Keywords=.*$/m;

    if (keywordRegex.test(content)) {
      // Replace existing Keywords line
      return content.replace(keywordRegex, keywordLine);
    } else {
      // Add Keywords line after [Desktop Entry] section
      const lines = content.split("\n");
      const desktopEntryIndex = lines.findIndex(
        (line) => line.trim() === "[Desktop Entry]",
      );

      if (desktopEntryIndex !== -1) {
        // Insert after [Desktop Entry]
        lines.splice(desktopEntryIndex + 1, 0, keywordLine);
        return lines.join("\n");
      } else {
        // If no [Desktop Entry] section, add at the end
        return content + "\n" + keywordLine;
      }
    }
  }

  /**
   * Patch keywords in a .metainfo.xml or .appdata.xml file
   * @param content - File content
   * @param keywords - Keywords to add
   * @returns Updated content
   */
  private patchKeywordsXml(content: string, keywords: string[]): string {
    // Generate keywords XML
    const keywordsXml = keywords
      .map((k) => `    <keyword>${this.escapeXml(k)}</keyword>`)
      .join("\n");

    const keywordsSection = `  <keywords>\n${keywordsXml}\n  </keywords>`;

    // Check if <keywords> section already exists
    const keywordsRegex = /<keywords>[\s\S]*?<\/keywords>/;

    if (keywordsRegex.test(content)) {
      // Replace existing keywords section
      return content.replace(keywordsRegex, keywordsSection);
    } else {
      // Add keywords section before </component>
      const componentEndRegex = /(<\/component>)/;

      if (componentEndRegex.test(content)) {
        return content.replace(componentEndRegex, `${keywordsSection}\n$1`);
      } else {
        // If no </component> tag, add at the end
        return content + "\n" + keywordsSection;
      }
    }
  }

  /**
   * Patch summary in a .metainfo.xml or .appdata.xml file
   * @param content - File content
   * @param summary - Summary text to add
   * @returns Updated content
   */
  private patchSummaryXml(content: string, summary: string): string {
    const escapedSummary = this.escapeXml(summary);
    const summaryTag = `  <summary>${escapedSummary}</summary>`;

    // Check if <summary> tag already exists
    const summaryRegex = /<summary>.*?<\/summary>/s;

    if (summaryRegex.test(content)) {
      // Replace existing summary
      return content.replace(summaryRegex, summaryTag);
    } else {
      // Add summary after <name> tag if it exists
      const nameRegex = /(<name>.*?<\/name>)/s;

      if (nameRegex.test(content)) {
        return content.replace(nameRegex, `$1\n${summaryTag}`);
      } else {
        // If no <name> tag, add after <component> opening tag
        const componentStartRegex = /(<component[^>]*>)/;

        if (componentStartRegex.test(content)) {
          return content.replace(componentStartRegex, `$1\n${summaryTag}`);
        } else {
          // Last resort: add at the beginning
          return summaryTag + "\n" + content;
        }
      }
    }
  }

  /**
   * Patch description in a .metainfo.xml or .appdata.xml file
   * @param content - File content
   * @param description - Description text to add
   * @returns Updated content
   */
  private patchDescriptionXml(content: string, description: string): string {
    // Convert plain text description to paragraphs
    const paragraphs = description
      .split("\n\n")
      .map((para) => para.trim())
      .filter((para) => para.length > 0)
      .map((para) => `    <p>\n      ${this.escapeXml(para)}\n    </p>`)
      .join("\n");

    const descriptionSection =
      `  <description>\n${paragraphs}\n  </description>`;

    // Check if <description> section already exists
    const descriptionRegex = /<description>[\s\S]*?<\/description>/;

    if (descriptionRegex.test(content)) {
      // Replace existing description
      return content.replace(descriptionRegex, descriptionSection);
    } else {
      // Add description after <summary> tag if it exists
      const summaryRegex = /(<summary>.*?<\/summary>)/s;

      if (summaryRegex.test(content)) {
        return content.replace(summaryRegex, `$1\n${descriptionSection}`);
      } else {
        // If no <summary> tag, add after <name> tag
        const nameRegex = /(<name>.*?<\/name>)/s;

        if (nameRegex.test(content)) {
          return content.replace(nameRegex, `$1\n${descriptionSection}`);
        } else {
          // Last resort: add before </component>
          const componentEndRegex = /(<\/component>)/;

          if (componentEndRegex.test(content)) {
            return content.replace(
              componentEndRegex,
              `${descriptionSection}\n$1`,
            );
          } else {
            return content + "\n" + descriptionSection;
          }
        }
      }
    }
  }

  /**
   * Escape XML special characters
   * @param text - Text to escape
   * @returns Escaped text
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /**
   * Write patched content to file
   * @param filePath - Path to file
   * @param content - New content
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    await Deno.writeTextFile(filePath, content);
  }
}
