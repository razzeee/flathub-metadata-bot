/**
 * Metadata Generator using LangChain
 * Uses LLM to generate keywords, summaries, and descriptions for Flathub apps
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AppstreamData } from "./flathub-api.ts";
import { FlathubAPI, getDescription, getKeywords } from "./flathub-api.ts";

export type LLMProvider = "openai" | "ollama";
export type GenerationMode = "keywords" | "summary" | "description" | "all";

export interface MetadataGeneratorConfig {
  provider: LLMProvider;
  apiKey?: string;
  modelName?: string;
  ollamaBaseUrl?: string;
}

// For backwards compatibility
export type KeywordGeneratorConfig = MetadataGeneratorConfig;

export class MetadataGenerator {
  private model: ChatOpenAI | ChatOllama;
  private config: MetadataGeneratorConfig;
  private flathubAPI: FlathubAPI;

  constructor(config: MetadataGeneratorConfig) {
    this.config = config;
    this.flathubAPI = new FlathubAPI();

    if (config.provider === "ollama") {
      this.model = new ChatOllama({
        model: config.modelName || "llama3.2:latest",
        baseUrl: config.ollamaBaseUrl || "http://localhost:11435",
        temperature: 0.7,
      });
    } else {
      if (!config.apiKey) {
        throw new Error(
          "OpenAI API key is required when using OpenAI provider"
        );
      }
      this.model = new ChatOpenAI({
        openAIApiKey: config.apiKey,
        modelName: config.modelName || "gpt-4o-mini",
        temperature: 0.7,
      }) as ChatOpenAI;
    }
  }

  /**
   * Fetch similar apps from Flathub for context (non-tool approach)
   */
  private async getSimilarApps(appId: string): Promise<string> {
    try {
      // Extract search term from app ID (e.g., "Firefox" from "org.mozilla.Firefox")
      const searchTerm = appId.split(".").pop() || "";

      const searchResult = await this.flathubAPI.search(searchTerm, 4);
      const hits = searchResult.hits || [];

      if (hits.length <= 1) return "";

      // Return info about similar apps (excluding the current app)
      const similarApps = hits
        .slice(1, 4)
        .filter((hit) => hit.app_id !== appId)
        .map(
          (hit) =>
            `- ${hit.name}: ${
              hit.keywords?.slice(0, 3).join(", ") || "no keywords"
            }`
        )
        .join("\n");

      return similarApps
        ? `\n\nSimilar apps and their keywords:\n${similarApps}`
        : "";
    } catch {
      return "";
    }
  }

  /**
   * Fetch all available Flathub categories
   */
  private async getCategories(): Promise<string> {
    try {
      const categories = await this.flathubAPI.getCategories();

      if (categories.length === 0) return "";

      const categoryNames = categories
        .filter((name) => name && name.length > 0)
        .join(", ");

      return categoryNames
        ? `\n\nAvailable Flathub categories (avoid duplicating these as keywords):\n${categoryNames}`
        : "";
    } catch {
      return "";
    }
  }

  /**
   * Get available models from Ollama server
   * @returns Array of available model names
   */
  private async getOllamaModels(): Promise<string[]> {
    try {
      const baseUrl = this.config.ollamaBaseUrl || "http://localhost:11435";
      const response = await fetch(`${baseUrl}/api/tags`);

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return data.models?.map((m: { name: string }) => m.name) || [];
    } catch {
      return [];
    }
  }

  /**
   * Generate keywords for an app based on its appstream data
   * @param appstream - Appstream data
   * @returns Array of generated keywords
   */
  async generateKeywords(appstream: AppstreamData): Promise<string[]> {
    const [similarAppsContext, categoriesContext] = await Promise.all([
      this.getSimilarApps(appstream.id),
      this.getCategories(),
    ]);

    const systemPrompt = `You are an SEO expert specializing in Linux desktop application discoverability.
Your task is to generate approximately 5 highly effective, SEO-optimized keywords that maximize search visibility.

IMPORTANT: Target 5 keywords. Only go up to 8 if truly necessary. Quality over quantity!

CRITICAL OUTPUT FORMAT:
- Return ONLY the keywords separated by commas
- NO introductory text like "Here are the keywords:"
- NO explanations or notes
- NO numbering or bullet points
- JUST the keywords: "keyword1, keyword2, keyword3"

SEO-FOCUSED GUIDELINES:
- Keywords should be lowercase
- Prioritize high-volume search terms users actually type
- Include specific functionality (e.g., "pdf editor", "video converter")
- Add only the most important synonyms (e.g., "image editor" + "photo editor")
- Include use-case keywords (e.g., "video editing", "screen recording")
- Target both technical and non-technical audiences
- Keep keywords concise (1-3 words for better matching)
- Avoid duplicating existing categories
- Include platform-specific terms only when highly relevant
- No special characters or punctuation

SEARCH INTENT FOCUS:
- What would users type to FIND this app?
- What problems does it solve? (include solution keywords)
- What are the top 2-3 alternatives users might search for?

Remember: Aim for 5 keywords. Only exceed this if there are truly critical keywords that must be included (max 8).`;

    const userPrompt = `Generate SEO-optimized keywords for this application:

Name: ${appstream.name}
Summary: ${appstream.summary}
Description: ${getDescription(appstream)}
Categories: ${appstream.categories?.join(", ") || "N/A"}
Existing Keywords: ${
      getKeywords(appstream)?.join(", ") || "None"
    }${similarAppsContext}${categoriesContext}

Think about:
1. What users would search for to find this app
2. Common problems this app solves
3. The top 2-3 most popular alternative apps
4. Both technical and everyday language

OUTPUT FORMAT: keyword1, keyword2, keyword3, keyword4, keyword5
Return ONLY the comma-separated keywords with NO other text.`;

    try {
      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ];

      const response = await this.model.invoke(messages);
      const content = response.content.toString().trim();

      // Clean up the response - remove common preamble patterns
      let cleanedContent = content;

      // Remove lines that look like preamble (e.g., "Here are 5 keywords:")
      const lines = content.split("\n");
      if (lines.length > 1 && lines[0].toLowerCase().includes("keyword")) {
        // If first line mentions "keyword", skip it and use the rest
        cleanedContent = lines.slice(1).join("\n").trim();
      }

      // Remove sentences at the start (anything before a colon or newline)
      cleanedContent = cleanedContent.replace(/^[^:\n]*:\s*/i, "");

      // Parse the comma-separated keywords
      let keywords = cleanedContent
        .split(/[,\n]/) // Split by comma or newline
        .map((k: string) => k.trim().toLowerCase())
        .map((k: string) => k.replace(/^[-•*]\s*/, "")) // Remove bullet points
        .map((k: string) => k.replace(/\.$/, "")) // Remove trailing periods
        .filter((k: string) => k.length > 0)
        .filter((k: string) => k.length < 50) // Filter out sentences (likely preamble)
        .filter((k: string) => !k.includes("here are")) // Filter out preamble
        .filter((k: string) => !k.includes("keywords")); // Filter out meta text

      // Remove duplicates while preserving order
      keywords = [...new Set(keywords)];

      // Apply hard limit after deduplication
      keywords = keywords.slice(0, 8);

      // If we ended up with no keywords, try a more aggressive extraction
      if (keywords.length === 0) {
        // Just take all words/phrases separated by commas or newlines
        keywords = content
          .split(/[,\n]/)
          .map((k: string) => k.trim().toLowerCase())
          .filter((k: string) => k.length > 0 && k.length < 50);

        // Remove duplicates
        keywords = [...new Set(keywords)];

        // Apply limit
        keywords = keywords.slice(0, 8);
      }

      return keywords;
    } catch (error) {
      throw await this.handleError(error, "keywords");
    }
  }

  /**
   * Generate a summary for an app based on its appstream data
   * Follows Flathub quality guidelines for summaries
   * @param appstream - Appstream data
   * @returns Generated summary string
   */
  async generateSummary(appstream: AppstreamData): Promise<string> {
    const systemPrompt = `You are an expert at writing app summaries following Flathub's quality guidelines.

CRITICAL OUTPUT FORMAT:
- Return ONLY the summary text
- NO introductory phrases like "Here's a summary:"
- NO quotation marks around the summary
- NO explanations or notes
- JUST the summary text itself

CRITICAL REQUIREMENTS:
- Length: Ideally 10-25 characters, MUST be under 35 characters
- Use sentence case: First letter capital, rest lowercase (e.g., "Benchmark systems", NOT "BENCHMARK SYSTEMS")
- Start with imperative verb (Benchmark, Create, Edit, View, Browse, etc.)
- Do NOT use ALL CAPS or Title Case
- Do NOT end with a period
- Do NOT start with an article (a, an, the)
- Do NOT repeat the app name
- Do NOT use technical terms (no toolkit, language, or implementation details)
- Do NOT mention "app", "tool", or "client"
- Do NOT use weird formatting or punctuation
- Make it understandable to non-technical users
- Focus on what users DO with the app, not what it is

GOOD EXAMPLES:
- "Benchmark system performance"
- "Edit images professionally"
- "Write markdown in style"
- "View images and videos"
- "Browse the web privately"
- "Create 3D models"
- "Manage your finances"

BAD EXAMPLES:
- "BENCHMARK SYSTEM PERFORMANCE" (all caps - wrong!)
- "Benchmark System Performance" (Title Case - wrong!)
- "benchmarks" (not capitalized, not descriptive)
- "system benchmarks" (not capitalized, passive)
- "A Simple Markdown Editor." (has article, ends with period)
- "GTK4 chat app" (technical, mentions toolkit)
- "The best editor" (starts with article)`;

    const userPrompt = `Generate a concise, user-friendly summary for this application:

Name: ${appstream.name}
Current Summary: ${appstream.summary || "N/A"}
Description: ${getDescription(appstream)}
Categories: ${appstream.categories?.join(", ") || "N/A"}

CRITICAL: Use sentence case (first letter capital, rest lowercase). Start with action verb. 10-25 chars ideal, max 35.
Examples: "Benchmark system performance", "Edit images professionally"
Return ONLY the summary text with NO other text, quotes, or explanations.`;

    try {
      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ];

      const response = await this.model.invoke(messages);
      let summary = response.content.toString().trim();

      // Remove common preamble patterns
      summary = summary.replace(/^(here'?s? a summary:?|summary:)\s*/i, "");

      // Remove quotes if present
      summary = summary.replace(/^["']|["']$/g, "");

      // Take only the first line if multiple lines
      summary = summary.split("\n")[0].trim();

      // Remove trailing period if present
      summary = summary.replace(/\.$/, "");

      // Fix all caps to sentence case
      if (
        summary.replace(/\s/g, "") === summary.replace(/\s/g, "").toUpperCase()
      ) {
        summary =
          summary.charAt(0).toUpperCase() + summary.slice(1).toLowerCase();
      }

      // Ensure first character is capitalized (sentence case)
      if (
        summary.length > 0 &&
        summary.charAt(0) !== summary.charAt(0).toUpperCase()
      ) {
        summary = summary.charAt(0).toUpperCase() + summary.slice(1);
      }

      // Validate: summary should not be just the app name
      if (summary.toLowerCase() === appstream.name.toLowerCase()) {
        throw new Error(
          `Generated summary is just the app name ("${summary}"). ` +
            `The summary should describe what the app does, not repeat its name.`
        );
      }

      if (summary.length > 35) {
        console.warn(
          `  ⚠️  Generated summary is ${summary.length} characters (max 35)`
        );
      }

      return summary;
    } catch (error) {
      throw this.handleError(error, "summary");
    }
  }

  /**
   * Generate a description for an app based on its appstream data
   * Follows Flathub quality guidelines for descriptions
   * @param appstream - Appstream data
   * @returns Generated description string formatted with proper AppStream XML tags
   */
  async generateDescription(appstream: AppstreamData): Promise<string> {
    const systemPrompt = `You are an expert at writing app descriptions for software stores, following Flathub and AppStream quality guidelines.

  CRITICAL OUTPUT FORMAT:
  - Use proper AppStream XML markup: <p>, <ul>, <ol>, <li>, <em>, <code>
  - NO markdown syntax, NO nested lists, ALL text inside <p> or <li> tags
  - DO NOT use any attributes in XML tags (no style, type, class, etc.)
  - Only plain tags are allowed, e.g. <ol><li>...</li></ol> is valid, <ol style="..."> is NOT valid

  CRITICAL REQUIREMENTS:
  - Length: 4-8 paragraphs or a mix of paragraphs and lists
  - Each paragraph: 2-4 sentences, 100-200 characters
  - Do NOT repeat or rephrase the summary
  - Focus on app purpose, features, and unique aspects
  - Use lists for key features (max 10 items)
  - Neutral, factual, and informative tone
  - NO subjective, review-like, or promotional language
  - Avoid phrases like "excellent choice", "it's easy to see why", "most popular", "best", "perfect for", "highly recommended", "ideal for", "community support"
  - Do NOT use first-person or second-person language (no "I", "we", "you")
  - Do NOT make recommendations or personal judgments
  - Target both technical and non-technical users
  - Do NOT start every paragraph or sentence with the app name. Only the first paragraph may introduce the app by name; subsequent paragraphs should use pronouns, vary sentence structure, or refer to features and functionality directly.

  CONTENT STRUCTURE:
  1. First paragraph: What the app does and its main functionality (may use app name)
  2. Second paragraph or list: Key features and capabilities (do not start with app name)
  3. Optional: Unique aspects, supported formats, integrations
  4. Optional: Technical highlights (if relevant)

  FORMATTING RULES:
  - Use <em> for emphasis, <code> for technical terms
  - Lists: 3-8 items for readability
  - Mix paragraphs and lists for variety
  - Each paragraph focused on one main idea

  GOOD EXAMPLE:
  <p>
    Kodi is a media center application for organizing and playing digital media. It supports a wide range of audio, video, and image formats, providing a unified interface for accessing content.
  </p>
  <p>
    The interface is optimized for televisions and remote controls, making it suitable for home entertainment setups. Multiple platforms are supported, allowing installation on a variety of devices.
  </p>
  <ul>
    <li>Playback of local and network media files</li>
    <li>Support for add-ons to extend functionality</li>
    <li>Customizable user interface and themes</li>
    <li>Library management for movies, TV shows, and music</li>
    <li>Remote control support</li>
  </ul>
  <p>
    Advanced features include media streaming, subtitles support, and compatibility with a wide range of audio codecs such as <code>MP3</code>, <code>AAC</code>, and <code>FLAC</code>.
  </p>

  BAD EXAMPLES:
  - Subjective or promotional language ("excellent choice", "most popular", "highly recommended")
  - First-person or second-person language ("you", "we")
  - Review-style opinions or recommendations
  - Plain text without XML tags
  - Markdown syntax for lists
  - Lists with more than 10 items
  - Too short (only 1-2 sentences)
  - Extremely technical details without context
  - Every paragraph or sentence starting with the app name
  - Any XML tag with attributes (e.g. <ol style="...">, <li type="...">)`;

    const userPrompt = `Generate a comprehensive, well-formatted description for this application:

Name: ${appstream.name}
Summary: ${appstream.summary}
Current Description: ${getDescription(appstream) || "N/A"}
Categories: ${appstream.categories?.join(", ") || "N/A"}
Keywords: ${getKeywords(appstream)?.join(", ") || "N/A"}

Create a description with 3-5 paragraphs and/or lists. Use proper AppStream XML tags: <p>, <ul>, <ol>, <li>, <em>, <code>.
Return ONLY the XML-formatted description with NO surrounding text, explanations, or code blocks.`;

    try {
      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ];

      const response = await this.model.invoke(messages);
      let description = response.content.toString().trim();

      // Remove common code block markers if present
      description = description.replace(/^```xml\s*/i, "");
      description = description.replace(/^```\s*/i, "");
      description = description.replace(/\s*```$/i, "");

      // Remove any surrounding <description> tags if the LLM added them
      description = description.replace(/^\s*<description>\s*/i, "");
      description = description.replace(/\s*<\/description>\s*$/i, "");

      // Validate that we have proper XML tags
      if (
        !description.includes("<p>") &&
        !description.includes("<ul>") &&
        !description.includes("<ol>")
      ) {
        // If no tags found, wrap plain text in paragraph tags
        console.warn(
          "  ⚠️  Description missing XML tags, wrapping in <p> tags"
        );

        // Split by double newlines for paragraphs
        const paragraphs = description
          .split(/\n\n+/)
          .filter((p: string) => p.trim().length > 0);
        description = paragraphs
          .map((p: string) => `<p>\n  ${p.trim()}\n</p>`)
          .join("\n");
      }

      return description.trim();
    } catch (error) {
      throw this.handleError(error, "description");
    }
  }

  /**
   * Handle LLM errors with helpful messages
   */
  private async handleError(
    error: unknown,
    generationType: string
  ): Promise<never> {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Provide helpful error messages for Ollama
    if (this.config.provider === "ollama") {
      if (errorMsg.includes("not found") && errorMsg.includes("model")) {
        const availableModels = await this.getOllamaModels();
        const modelName = this.config.modelName || "llama3.2:1b";

        if (availableModels.length > 0) {
          throw new Error(
            `Model '${modelName}' not found.\n\n` +
              `Available models on your system:\n` +
              availableModels.map((m) => `  - ${m}`).join("\n") +
              `\n\nTo use one of these models, set LLM_MODEL in your .env file.\n` +
              `Or install a new model with: ollama pull llama3.2:1b`
          );
        } else {
          throw new Error(
            `Model '${modelName}' not found.\n\n` +
              `Install it with: ollama pull ${modelName}\n` +
              `Popular models: llama3.2:1b, llama3.2, mistral, qwen2.5, phi3`
          );
        }
      } else if (
        errorMsg.includes("ECONNREFUSED") ||
        errorMsg.includes("fetch failed")
      ) {
        throw new Error(
          `Cannot connect to Ollama server at ${
            this.config.ollamaBaseUrl || "http://localhost:11435"
          }.\n\n` +
            `Please ensure Ollama is running:\n` +
            `  1. Start Ollama: ollama serve\n` +
            `  2. Or check if it's running: curl ${
              this.config.ollamaBaseUrl || "http://localhost:11435"
            }/api/tags`
        );
      }
    }

    throw new Error(`Error generating ${generationType}: ${errorMsg}`);
  }
}

// Export alias for backwards compatibility
export class KeywordGenerator extends MetadataGenerator {}
