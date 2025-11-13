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
    // Detect existing indentation or use 4 spaces as default
    const existingMatch = content.match(/^(\s*)<keywords>/m);
    const baseIndent = existingMatch ? existingMatch[1] : "    ";
    const contentIndent = baseIndent + "    "; // Add 4 more spaces for content

    // Generate keywords XML with proper indentation
    const keywordsXml = keywords
      .map((k) => `${contentIndent}<keyword>${this.escapeXml(k)}</keyword>`)
      .join("\n");

    const keywordsSection =
      `${baseIndent}<keywords>\n${keywordsXml}\n${baseIndent}</keywords>`;

    // Check if <keywords> section already exists
    const keywordsRegex = /^\s*<keywords>[\s\S]*?<\/keywords>/m;

    if (keywordsRegex.test(content)) {
      // Replace existing keywords section
      return content.replace(keywordsRegex, keywordsSection);
    } else {
      // Add keywords section before </component>
      const componentEndRegex = /^(\s*)(<\/component>)/m;

      if (componentEndRegex.test(content)) {
        return content.replace(componentEndRegex, `${keywordsSection}\n$1$2`);
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

    // Detect existing indentation or use 4 spaces as default
    const existingMatch = content.match(/^(\s*)<summary>/m);
    const baseIndent = existingMatch ? existingMatch[1] : "    ";

    const summaryTag = `${baseIndent}<summary>${escapedSummary}</summary>`;

    // Check if <summary> tag already exists
    const summaryRegex = /^\s*<summary>.*?<\/summary>/ms;

    if (summaryRegex.test(content)) {
      // Replace existing summary
      return content.replace(summaryRegex, summaryTag);
    } else {
      // Add summary after <name> tag if it exists
      const nameRegex = /^(\s*)(<name>.*?<\/name>)/ms;

      if (nameRegex.test(content)) {
        return content.replace(nameRegex, `$1$2\n${summaryTag}`);
      } else {
        // If no <name> tag, add after <component> opening tag
        const componentStartRegex = /^(\s*)(<component[^>]*>)/m;

        if (componentStartRegex.test(content)) {
          return content.replace(componentStartRegex, `$1$2\n${summaryTag}`);
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
   * @param description - Description text to add (should be pre-formatted XML)
   * @returns Updated content
   */
  private patchDescriptionXml(content: string, description: string): string {
    // Description is already formatted XML from the generator
    // Detect existing indentation or use 4 spaces as default
    const existingMatch = content.match(/^(\s*)<description>/m);
    const baseIndent = existingMatch ? existingMatch[1] : "    ";
    const contentIndent = baseIndent + "    "; // Add 4 more spaces for content

    // Extract existing disclaimer paragraphs (NOTE: ...) if present so we can preserve them
    const descriptionRegexCapture = /<description>[\s\S]*?<\/description>/;
    let disclaimerBlocks: string[] = [];
    const existingDescriptionBlock = descriptionRegexCapture.exec(content)?.[0];
    if (existingDescriptionBlock) {
      // Find paragraphs containing NOTE: - be flexible with opening <p> tag
      // Match <p>, <p >, <p\n>, etc.
      const paragraphRegex = /<p(?:\s[^>]*)?>[\s\S]*?<\/p>/gi;
      const paragraphs = existingDescriptionBlock.match(paragraphRegex) || [];
      for (const p of paragraphs) {
        // Check if paragraph contains NOTE: disclaimer (more flexible pattern)
        if (/NOTE:\s*This\s+application/i.test(p)) {
          // Extract clean text content and normalize whitespace
          const textContent = p
            .replace(/<\/?p(?:\s[^>]*)?>?/gi, "")
            .replace(/\s+/g, " ")
            .trim();
          disclaimerBlocks.push(textContent);
        }
      }
      // De-duplicate identical disclaimer paragraphs
      disclaimerBlocks = Array.from(new Set(disclaimerBlocks));
    }

    // Indent the description properly
    let indentedDescription = description
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return "";
        return `${contentIndent}${trimmed}`;
      })
      .filter((line) => line.length > 0)
      .join("\n");

    // Append disclaimers at end if not already included (preserve at all cost)
    if (disclaimerBlocks.length > 0) {
      for (const block of disclaimerBlocks) {
        // Check if disclaimer text is already present anywhere in description
        const normalizedBlock = block.replace(/\s+/g, " ").toLowerCase();
        const normalizedDesc = indentedDescription
          .replace(/\s+/g, " ")
          .toLowerCase();
        if (!normalizedDesc.includes(normalizedBlock)) {
          // Wrap in <p> tags and indent properly
          const disclaimerParagraph =
            `${contentIndent}<p>\n${contentIndent}  ${block}\n${contentIndent}</p>`;
          indentedDescription += `\n${disclaimerParagraph}`;
        }
      }
    }

    const descriptionSection =
      `${baseIndent}<description>\n${indentedDescription}\n${baseIndent}</description>`;

    // Check if <description> section already exists
    const descriptionRegex = /^\s*<description>[\s\S]*?<\/description>/m;

    if (descriptionRegex.test(content)) {
      // Replace existing description while preserving disclaimers (already appended above)
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
