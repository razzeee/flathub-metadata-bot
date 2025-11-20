/**
 * File Patcher
 * Updates keywords, summaries, and descriptions in .desktop and .metainfo.xml files
 */

import type { MetadataFile } from "./repository-manager.ts";

export type PatchType = "keywords" | "summary" | "description";

interface IndentationStyle {
  type: "tabs" | "spaces";
  size: number;
  unit: string; // The actual string to use for one level of indentation
}

export class FilePatcher {
  /**
   * Detect the indentation style used in a file
   * @param content - File content
   * @returns Indentation style information
   */
  private detectIndentation(content: string): IndentationStyle {
    const lines = content.split("\n");
    const indentedLines: string[] = [];

    // Collect lines that start with whitespace
    for (const line of lines) {
      const match = line.match(/^(\s+)\S/);
      if (match) {
        indentedLines.push(match[1]);
      }
    }

    if (indentedLines.length === 0) {
      // No indented lines found, default to 4 spaces
      return { type: "spaces", size: 4, unit: "    " };
    }

    // Check if tabs are used
    const tabLines = indentedLines.filter((indent) => indent.includes("\t"));
    if (tabLines.length > indentedLines.length / 2) {
      // Majority use tabs
      return { type: "tabs", size: 1, unit: "\t" };
    }

    // Count spaces - find the most common indentation size
    const spaceCounts: { [key: number]: number } = {};
    for (const indent of indentedLines) {
      const spaces = indent.length;
      // Only count sizes that are likely intentional (2, 4, 8, etc.)
      if (spaces > 0 && spaces <= 8) {
        spaceCounts[spaces] = (spaceCounts[spaces] || 0) + 1;
      }
    }

    // Find GCD-like common divisor for indentation
    const sizes = Object.keys(spaceCounts).map(Number).sort((a, b) => a - b);
    let indentSize = 4; // default

    if (sizes.length > 0) {
      // Use the smallest non-zero size as base
      indentSize = sizes[0];

      // If we see patterns like 2, 4, 6, 8 -> use 2
      // If we see patterns like 4, 8 -> use 4
      if (sizes.length > 1) {
        const gcd = (
          a: number,
          b: number,
        ): number => (b === 0 ? a : gcd(b, a % b));
        indentSize = sizes.reduce((acc, size) => gcd(acc, size));
      }

      // Clamp to reasonable values
      if (indentSize < 1) indentSize = 2;
      if (indentSize > 8) indentSize = 4;
    }

    return {
      type: "spaces",
      size: indentSize,
      unit: " ".repeat(indentSize),
    };
  }

  /**
   * Get indentation string for a given level
   * @param content - File content to detect style from
   * @param baseIndent - Base indentation string (if known)
   * @param levels - Number of indentation levels
   * @returns Indentation string
   */
  private getIndent(
    content: string,
    baseIndent: string | null = null,
    levels: number = 1,
  ): string {
    if (baseIndent !== null && levels === 0) {
      return baseIndent;
    }

    const style = this.detectIndentation(content);

    if (baseIndent !== null) {
      // Add to existing base indent
      return baseIndent + style.unit.repeat(levels);
    }

    return style.unit.repeat(levels);
  }
  /**
   * Check if a file already contains keywords
   * @param file - Metadata file to check
   * @returns true if keywords exist, false otherwise
   */
  hasKeywords(file: MetadataFile): boolean {
    if (file.type === "desktop") {
      return /^Keywords=/m.test(file.content);
    } else {
      return /<keywords>[\s\S]*?<\/keywords>/m.test(file.content);
    }
  }

  /**
   * Extract existing keywords from a file
   * @param file - Metadata file to extract from
   * @returns Array of existing keywords
   */
  getExistingKeywords(file: MetadataFile): string[] {
    if (file.type === "desktop") {
      const match = file.content.match(/^Keywords=(.*)$/m);
      if (match) {
        return match[1]
          .split(";")
          .map((k) => k.trim())
          .filter((k) => k.length > 0);
      }
    } else {
      const match = file.content.match(/<keywords>[\s\S]*?<\/keywords>/m);
      if (match) {
        const keywordTags = match[0].match(/<keyword>([^<]+)<\/keyword>/g);
        if (keywordTags) {
          return keywordTags.map((tag) =>
            tag.replace(/<\/?keyword>/g, "").trim()
          );
        }
      }
    }
    return [];
  }

  /**
   * Merge new keywords with existing ones, avoiding duplicates
   * @param existing - Existing keywords
   * @param newKeywords - New keywords to add
   * @returns Merged keyword array
   */
  mergeKeywords(existing: string[], newKeywords: string[]): string[] {
    const existingLower = existing.map((k) => k.toLowerCase());
    const unique = [...existing];

    for (const keyword of newKeywords) {
      if (!existingLower.includes(keyword.toLowerCase())) {
        unique.push(keyword);
        existingLower.push(keyword.toLowerCase());
      }
    }

    return unique;
  }

  /**
   * Patch keywords into a metadata file
   * @param file - Metadata file to patch
   * @param keywords - Keywords to add
   * @returns Updated file content
   */
  patchKeywords(file: MetadataFile, keywords: string[]): string {
    // Check if keywords already exist and merge if they do
    const existing = this.getExistingKeywords(file);
    const mergedKeywords = existing.length > 0
      ? this.mergeKeywords(existing, keywords)
      : keywords;

    if (file.type === "desktop") {
      return this.patchDesktopFile(file.content, mergedKeywords);
    } else {
      return this.patchKeywordsXml(file.content, mergedKeywords);
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
    // Detect existing indentation
    const existingMatch = content.match(/^(\s*)<keywords>/m);
    let baseIndent: string;

    if (existingMatch) {
      // Use existing keywords indentation
      baseIndent = existingMatch[1];
    } else {
      // Detect from other elements (try <name>, <summary>, or <component> children)
      const elementMatch = content.match(/^(\s*)<(?:name|summary|id)>/m);
      baseIndent = elementMatch
        ? elementMatch[1]
        : this.getIndent(content, null, 1);
    }

    const contentIndent = this.getIndent(content, baseIndent, 1);

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

    // Detect existing indentation
    const existingMatch = content.match(/^(\s*)<summary>/m);
    let baseIndent: string;

    if (existingMatch) {
      // Use existing summary indentation
      baseIndent = existingMatch[1];
    } else {
      // Detect from other elements (try <name>, <id>, or <component> children)
      const elementMatch = content.match(/^(\s*)<(?:name|id)>/m);
      baseIndent = elementMatch
        ? elementMatch[1]
        : this.getIndent(content, null, 1);
    }

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
    // Detect existing indentation
    const existingMatch = content.match(/^(\s*)<description>/m);
    let baseIndent: string;

    if (existingMatch) {
      // Use existing description indentation
      baseIndent = existingMatch[1];
    } else {
      // Detect from other elements (try <summary>, <name>, or <component> children)
      const elementMatch = content.match(/^(\s*)<(?:summary|name|id)>/m);
      baseIndent = elementMatch
        ? elementMatch[1]
        : this.getIndent(content, null, 1);
    }

    const contentIndent = this.getIndent(content, baseIndent, 1);

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
