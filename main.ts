#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --allow-run

/**
 * Metadata Bot - Main Entry Point
 * Automates keyword, summary, and description generation and PR creation for Flathub apps
 */

import { AppStreamClient, type AppstreamData } from "./src/appstream-client.ts";
import {
  type GenerationMode,
  MetadataGenerator,
} from "./src/metadata-generator.ts";
import {
  type MetadataFile,
  RepositoryManager,
} from "./src/repository-manager.ts";
import { FilePatcher } from "./src/file-patcher.ts";
import { PRManager } from "./src/pr-manager.ts";
import { BatchProcessor } from "./src/batch-processor.ts";
import { load } from "@std/dotenv";

// Load environment variables
const env = await load();
const OPENAI_API_KEY = env.OPENAI_API_KEY || Deno.env.get("OPENAI_API_KEY");
const LLM_PROVIDER = (env.LLM_PROVIDER ||
  Deno.env.get("LLM_PROVIDER") ||
  "ollama") as "openai" | "ollama";
const LLM_MODEL = env.LLM_MODEL || Deno.env.get("LLM_MODEL");
const OLLAMA_BASE_URL = env.OLLAMA_BASE_URL || Deno.env.get("OLLAMA_BASE_URL");
const GITHUB_TOKEN = env.GITHUB_TOKEN || Deno.env.get("GITHUB_TOKEN");
const GITLAB_TOKEN = env.GITLAB_TOKEN || Deno.env.get("GITLAB_TOKEN");
const GITLAB_GNOME_TOKEN = env.GITLAB_GNOME_TOKEN ||
  Deno.env.get("GITLAB_GNOME_TOKEN");
const GITLAB_KDE_TOKEN = env.GITLAB_KDE_TOKEN ||
  Deno.env.get("GITLAB_KDE_TOKEN");
const GITLAB_FREEDESKTOP_TOKEN = env.GITLAB_FREEDESKTOP_TOKEN ||
  Deno.env.get("GITLAB_FREEDESKTOP_TOKEN");
const CODEBERG_TOKEN = env.CODEBERG_TOKEN || Deno.env.get("CODEBERG_TOKEN");
const APPSTREAM_URL = env.APPSTREAM_URL || Deno.env.get("APPSTREAM_URL");

/**
 * Get the Flathub repository URL for an app
 * @param appId - The Flathub app ID
 * @returns Flathub repository URL
 */
function getFlathubRepoUrl(appId: string): string {
  return `https://github.com/flathub/${appId}`;
}

/**
 * Prompt user after generating a value
 * Returns: 'accept', 'regenerate', 'skip', or 'quit'
 */
function promptForValue(metadataType: string): string {
  console.log("\n" + "=".repeat(60));
  const response = prompt(
    `${metadataType}: (a)ccept, (r)egenerate, (s)kip, or (q)uit: `,
  );
  console.log("=".repeat(60));

  if (response === null || response.toLowerCase() === "q") {
    console.log("\n👋 Cancelled by user");
    Deno.exit(0);
  }

  const normalized = response.toLowerCase();
  if (normalized === "a" || normalized === "accept") return "accept";
  if (normalized === "r" || normalized === "regenerate") {
    return "regenerate";
  }
  if (normalized === "s" || normalized === "skip") return "skip";

  // Default to regenerate for invalid input
  console.log("Invalid input, treating as regenerate");
  return "regenerate";
}

async function main() {
  // Parse command line arguments
  const args = Deno.args;

  // Check for mode flag and batch mode
  let mode: GenerationMode = "all"; // default mode - run all generators
  let appId: string | undefined;
  let batchMode = false;
  let skipWithKeywords = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--mode" && i + 1 < args.length) {
      const modeArg = args[i + 1];
      if (
        modeArg === "keywords" ||
        modeArg === "summary" ||
        modeArg === "description" ||
        modeArg === "all"
      ) {
        mode = modeArg;
      } else {
        console.error(`Invalid mode: ${modeArg}`);
        console.error("Valid modes are: all, keywords, summary, description");
        Deno.exit(1);
      }
      i++; // skip the mode value
    } else if (args[i] === "--batch") {
      batchMode = true;
    } else if (args[i] === "--skip-with-keywords") {
      skipWithKeywords = true;
    } else if (!appId) {
      appId = args[i];
    }
  }

  // Validate arguments
  if (batchMode && appId) {
    console.error("Error: Cannot specify both --batch and an app ID");
    console.error(
      "Use --batch for batch mode OR specify an app ID for single app mode",
    );
    Deno.exit(1);
  }

  if (!batchMode && !appId) {
    console.error(
      "Usage: deno task dev [--mode <all|keywords|summary|description>] <app-id>",
    );
    console.error(
      "   OR: deno task dev --batch [--skip-with-keywords] [--mode <mode>]",
    );
    console.error("");
    console.error("Examples:");
    console.error("  Single app: deno task dev org.mozilla.Firefox");
    console.error(
      "  Single app with mode: deno task dev --mode keywords org.mozilla.Firefox",
    );
    console.error("  Batch mode: deno task dev --batch");
    console.error(
      "  Batch mode (skip apps with keywords): deno task dev --batch --skip-with-keywords",
    );
    console.error(
      "  Batch mode (keywords only): deno task dev --batch --mode keywords",
    );
    console.error("\nModes:");
    console.error(
      "  all          - Generate keywords, summary, and description (default)",
    );
    console.error("  keywords     - Generate keywords only");
    console.error("  summary      - Generate app summary only");
    console.error("  description  - Generate app description only");
    Deno.exit(1);
  }

  // Validate configuration based on provider
  if (LLM_PROVIDER === "openai" && !OPENAI_API_KEY) {
    console.error("Error: OPENAI_API_KEY not set");
    console.error("Please set it in .env file or environment variables");
    Deno.exit(1);
  }

  // If batch mode, get list of apps and process them one by one
  const appsToProcess: Array<{ appId: string; appstream: AppstreamData }> = [];

  if (batchMode) {
    console.log("\n🚀 Starting batch processing mode...");
    console.log(`   Mode: ${mode}`);
    console.log(`   LLM Provider: ${LLM_PROVIDER}`);
    if (LLM_PROVIDER === "ollama") {
      console.log(
        `   Ollama URL: ${OLLAMA_BASE_URL || "http://localhost:11435"}`,
      );
      console.log(`   Model: ${LLM_MODEL || "llama3.2"}`);
    } else {
      console.log(`   Model: ${LLM_MODEL || "gpt-4o-mini"}`);
    }
    if (APPSTREAM_URL) {
      console.log(`   AppStream URL: ${APPSTREAM_URL}`);
    }
    console.log(`   Skip apps with keywords: ${skipWithKeywords}`);
    console.log();

    try {
      const batchProcessor = new BatchProcessor({
        appstreamUrl: APPSTREAM_URL,
        skipWithKeywords,
        onAppProcess: (id, appstream) => {
          // Just collect the apps - we'll process them using the main workflow
          appsToProcess.push({ appId: id, appstream });
          return Promise.resolve();
        },
      });

      await batchProcessor.run();

      if (appsToProcess.length === 0) {
        console.log("\n✨ No apps to process!\n");
        return;
      }

      console.log(`\n📋 Found ${appsToProcess.length} apps to process\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ Batch processing error: ${message}`);
      Deno.exit(1);
    }
  }

  // Process apps (either single app or batch)
  const appsToIterate = batchMode
    ? appsToProcess
    : [{ appId: appId!, appstream: null as unknown as AppstreamData }]; // appstream will be fetched below

  for (let appIndex = 0; appIndex < appsToIterate.length; appIndex++) {
    const currentApp = appsToIterate[appIndex];
    appId = currentApp.appId;

    if (batchMode) {
      console.log("\n" + "=".repeat(80));
      console.log(
        `📦 Processing ${appId} (${appIndex + 1}/${appsToIterate.length})`,
      );
      console.log("=".repeat(80) + "\n");
    }

    // Single app mode continues below (or current app in batch)
    console.log(`\n🚀 Processing app: ${appId}`);
    console.log(`   Mode: ${mode}`);
    console.log(`   LLM Provider: ${LLM_PROVIDER}`);
    if (LLM_PROVIDER === "ollama") {
      console.log(
        `   Ollama URL: ${OLLAMA_BASE_URL || "http://localhost:11435"}`,
      );
      console.log(`   Model: ${LLM_MODEL || "llama3.2"}`);
    } else {
      console.log(`   Model: ${LLM_MODEL || "gpt-4o-mini"}`);
    }
    if (APPSTREAM_URL) {
      console.log(`   AppStream URL: ${APPSTREAM_URL}`);
    }
    console.log();

    try {
      // Step 1: Fetch appstream data
      console.log("📥 Fetching appstream data...");
      const appStreamClient = new AppStreamClient(APPSTREAM_URL);
      // appId is guaranteed defined beyond this point
      const appstream = await appStreamClient.getAppstream(appId!);
      console.log(`✅ Found: ${appstream.name}`);
      console.log(`   Summary: ${appstream.summary}`);

      // Step 1.5: Attempt to read existing metadata from repository for comparison
      interface ExistingMetadata {
        summary?: string;
        description?: string;
        keywords?: string[];
      }
      const existing: ExistingMetadata = {};
      try {
        const repoManagerProbe = new RepositoryManager();
        // Prefer Flathub repo
        const flathubRepoUrlProbe = getFlathubRepoUrl(appId!);
        let probeRepoPath: string | null = null;
        let metaFiles: MetadataFile[] = [];

        // Try Flathub repo first
        try {
          const path = await repoManagerProbe.cloneRepository(
            flathubRepoUrlProbe,
            `${appId}_probe_flathub`,
          );
          const files = await repoManagerProbe.findMetadataFiles(path, appId!);
          if (files.length > 0) {
            probeRepoPath = path;
            metaFiles = files;
          }
        } catch (_) {
          // ignore
        }

        // Fallback to upstream if no files found yet
        if (!probeRepoPath) {
          const upstreamUrl = appStreamClient.getRepositoryUrl(appstream);
          if (upstreamUrl) {
            try {
              const path = await repoManagerProbe.cloneRepository(
                upstreamUrl,
                `${appId}_probe_upstream`,
              );
              const files = await repoManagerProbe.findMetadataFiles(
                path,
                appId!,
              );
              if (files.length > 0) {
                probeRepoPath = path;
                metaFiles = files;
              }
            } catch (_) {
              /* ignore */
            }
          }
        }

        if (probeRepoPath && metaFiles.length > 0) {
          // Parse first suitable file(s)
          for (const f of metaFiles) {
            const c = f.content;
            if (!existing.summary) {
              const m = c.match(/<summary>([\s\S]*?)<\/summary>/);
              if (m) existing.summary = m[1].trim();
            }
            if (!existing.description) {
              const d = c.match(/<description>([\s\S]*?)<\/description>/);
              if (d) existing.description = d[1].trim();
            }
            if (!existing.keywords) {
              if (f.type === "desktop") {
                const kLine = c
                  .split(/\r?\n/)
                  .find((l) => l.startsWith("Keywords="));
                if (kLine) {
                  const raw = kLine.replace("Keywords=", "").replace(/;$/, "");
                  existing.keywords = raw
                    .split(";")
                    .filter(Boolean)
                    .map((x) => x.trim());
                }
              } else {
                const kBlock = c.match(
                  /<keywords(?:\s+[^>]*)?>([\s\S]*?)<\/keywords>/,
                );
                if (kBlock) {
                  const kw = [
                    ...kBlock[1].matchAll(
                      /<keyword(?:\s+[^>]*)?>([\s\S]*?)<\/keyword>/g,
                    ),
                  ]
                    .map((m) => m[1].trim())
                    .filter(Boolean);
                  if (kw.length) existing.keywords = kw;
                }
              }
            }
            if (existing.summary && existing.description && existing.keywords) {
              break; // enough gathered
            }
          }
        }
        // Fallbacks to appstream if not found
        if (!existing.summary && appstream.summary) {
          existing.summary = appstream.summary;
        }
        if (!existing.description && (appstream as AppstreamData).description) {
          existing.description = (appstream as AppstreamData).description ||
            undefined;
        }
      } catch (e) {
        console.warn(
          `⚠️  Could not extract existing metadata for comparison: ${
            e instanceof Error ? e.message : e
          }`,
        );
      }

      // Step 2: Generate metadata based on mode
      const metadataGenerator = new MetadataGenerator({
        provider: LLM_PROVIDER,
        apiKey: OPENAI_API_KEY,
        modelName: LLM_MODEL,
        ollamaBaseUrl: OLLAMA_BASE_URL,
      });

      // Variables to store generated metadata
      let keywords: string[] = [];
      let summary = "";
      let description = "";
      const acceptedMetadata: {
        keywords: boolean;
        summary: boolean;
        description: boolean;
      } = {
        keywords: false,
        summary: false,
        description: false,
      };

      // Generate keywords if needed
      if (mode === "all" || mode === "keywords") {
        let keywordDecision = "";
        while (keywordDecision !== "accept" && keywordDecision !== "skip") {
          console.log("\n🔎 Existing keywords:");
          if (existing.keywords && existing.keywords.length) {
            existing.keywords.forEach((k, i) =>
              console.log(`   ${i + 1}. ${k}`)
            );
          } else {
            console.log("   (none found)");
          }
          console.log("\n📝 Generating keywords...");
          keywords = await metadataGenerator.generateKeywords(appstream);

          if (keywords.length === 0) {
            console.error("\n❌ No keywords were generated!");
            console.error("The AI did not produce any valid keywords.");
            console.error("Please try again or check your LLM configuration.");
            Deno.exit(1);
          }

          console.log(`✅ Generated ${keywords.length} keywords:`);
          keywords.forEach((k, i) => console.log(`   ${i + 1}. ${k}`));

          keywordDecision = promptForValue("Keywords");
          if (keywordDecision === "accept") {
            acceptedMetadata.keywords = true;
          } else if (keywordDecision === "skip") {
            console.log("⏭️  Skipping keywords");
          } else {
            console.log("🔄 Regenerating keywords...");
          }
        }
      }

      // Generate summary if needed
      if (mode === "all" || mode === "summary") {
        let summaryDecision = "";
        while (summaryDecision !== "accept" && summaryDecision !== "skip") {
          console.log("\n🔎 Existing summary:");
          if (existing.summary) {
            console.log(
              `   "${existing.summary}" (${existing.summary.length} chars)`,
            );
          } else {
            console.log("   (none found)");
          }
          console.log("\n📝 Generating summary...");
          summary = await metadataGenerator.generateSummary(appstream);

          console.log(`✅ Generated summary (${summary.length} chars):`);
          console.log(`   "${summary}"`);
          if (summary.length > 35) {
            console.warn(
              `   ⚠️  Warning: Summary exceeds 35 characters (${summary.length})`,
            );
          }

          summaryDecision = promptForValue("Summary");
          if (summaryDecision === "accept") {
            acceptedMetadata.summary = true;
          } else if (summaryDecision === "skip") {
            console.log("⏭️  Skipping summary");
          } else {
            console.log("🔄 Regenerating summary...");
          }
        }
      }

      // Generate description if needed
      if (mode === "all" || mode === "description") {
        let descriptionDecision = "";
        while (
          descriptionDecision !== "accept" &&
          descriptionDecision !== "skip"
        ) {
          console.log("\n🔎 Existing description (truncated preview):");
          if (existing.description) {
            const previewLines = existing.description
              .split(/\r?\n/)
              .slice(0, 12);
            previewLines.forEach((line) => console.log(`   ${line}`));
            if (
              previewLines.length < existing.description.split(/\r?\n/).length
            ) {
              console.log("   ... (truncated) ...");
            }
          } else {
            console.log("   (none found)");
          }
          console.log("\n📝 Generating description...");
          description = await metadataGenerator.generateDescription(appstream);

          console.log(
            `✅ Generated description (${description.length} chars):`,
          );
          const lines = description.split("\n");
          lines.forEach((line) => console.log(`   ${line}`));

          descriptionDecision = promptForValue("Description");
          if (descriptionDecision === "accept") {
            acceptedMetadata.description = true;
          } else if (descriptionDecision === "skip") {
            console.log("⏭️  Skipping description");
          } else {
            console.log("🔄 Regenerating description...");
          }
        }
      }

      // Check if any metadata was accepted
      if (
        !acceptedMetadata.keywords &&
        !acceptedMetadata.summary &&
        !acceptedMetadata.description
      ) {
        console.log("\n⚠️  No metadata changes were accepted. Exiting.");
        Deno.exit(0);
      }

      // Build commit message and PR details based on accepted metadata
      const acceptedItems: string[] = [];
      const acceptedChanges: string[] = [];

      if (acceptedMetadata.keywords) {
        acceptedItems.push(`Keywords: ${keywords.join(", ")}`);
        acceptedChanges.push(
          `### 🏷️ Keywords\n\n\`\`\`\n${
            keywords
              .map((k: string) => `- ${k}`)
              .join("\n")
          }\n\`\`\``,
        );
      }
      if (acceptedMetadata.summary) {
        acceptedItems.push(`Summary: ${summary}`);
        acceptedChanges.push(`### 📋 Summary\n\n\`\`\`\n${summary}\n\`\`\``);
      }
      if (acceptedMetadata.description) {
        acceptedItems.push(`Description: Updated`);
        acceptedChanges.push(
          `### 📝 Description\n\n\`\`\`xml\n${description}\n\`\`\``,
        );
      }

      const commitMessage =
        `Update metadata for ${appId}\n\nAutomatically generated:\n${
          acceptedItems
            .map((item) => `- ${item}`)
            .join("\n")
        }`;
      const prTitle = `Update metadata for ${appId}`;
      const prDescription =
        `This PR updates the metadata to improve discoverability and user experience for **${appstream.name}**.\n\n---\n\n${
          acceptedChanges.join(
            "\n\n---\n\n",
          )
        }\n\n---\n\n*Generated by Metadata Bot 🤖*`;

      // User accepted at least one value, proceed with repo operations
      const repoManager = new RepositoryManager();
      let metadataFiles: MetadataFile[] = [];
      let repoPath = "";
      let repoUrl = "";
      let isFlathubRepo = false;

      // Step 3: Try Flathub repository first
      console.log("\n📦 Checking Flathub repository...");
      const flathubRepoUrl = getFlathubRepoUrl(appId!);
      console.log(`   ${flathubRepoUrl}`);

      try {
        const flathubRepoPath = await repoManager.cloneRepository(
          flathubRepoUrl,
          `${appId}_flathub`,
        );
        console.log(`✅ Cloned Flathub repo to: ${flathubRepoPath}`);

        console.log("\n🔍 Searching for metadata files in Flathub repo...");
        metadataFiles = await repoManager.findMetadataFiles(
          flathubRepoPath,
          appId!,
        );

        if (metadataFiles.length > 0) {
          console.log(
            `✅ Found ${metadataFiles.length} file(s) in Flathub repo:`,
          );
          metadataFiles.forEach((file) => {
            const templateLabel = file.isTemplate ? " [template]" : "";
            console.log(`   - ${file.path} (${file.type}${templateLabel})`);
          });
          repoPath = flathubRepoPath;
          repoUrl = flathubRepoUrl;
          isFlathubRepo = true;
        } else {
          console.log("⚠️  No metadata files found in Flathub repo");
        }
      } catch (error) {
        console.log(
          `⚠️  Could not access Flathub repo: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }

      // Step 4: If no files found in Flathub repo, try upstream repository
      if (metadataFiles.length === 0) {
        const upstreamRepoUrl = appStreamClient.getRepositoryUrl(appstream);
        if (!upstreamRepoUrl) {
          console.error(
            "\n❌ No upstream repository URL found in appstream data",
          );
          Deno.exit(1);
        }

        console.log(`\n📦 Trying upstream repository: ${upstreamRepoUrl}`);
        const upstreamRepoPath = await repoManager.cloneRepository(
          upstreamRepoUrl,
          `${appId}_upstream`,
        );
        console.log(`✅ Cloned to: ${upstreamRepoPath}`);

        console.log("\n🔍 Searching for metadata files in upstream repo...");
        metadataFiles = await repoManager.findMetadataFiles(
          upstreamRepoPath,
          appId!,
        );

        if (metadataFiles.length === 0) {
          console.error("❌ No metadata files found in either repository");
          Deno.exit(1);
        }

        console.log(`✅ Found ${metadataFiles.length} file(s):`);
        metadataFiles.forEach((file) => {
          const templateLabel = file.isTemplate ? " [template]" : "";
          console.log(`   - ${file.path} (${file.type}${templateLabel})`);
        });
        repoPath = upstreamRepoPath;
        repoUrl = upstreamRepoUrl!; // upstreamRepoUrl guarded above
        isFlathubRepo = false;
      }

      console.log(
        `\n📍 Using ${
          isFlathubRepo ? "Flathub" : "upstream"
        } repository for changes`,
      );

      // Step 5: Patch files with accepted metadata
      console.log(`\n✏️  Patching files with accepted metadata...`);
      const filePatcher = new FilePatcher();

      // Check if we have appstream XML files (prioritize them over .desktop files)
      const hasAppstreamFiles = metadataFiles.some(
        (file) => file.type === "metainfo" || file.type === "appdata",
      );

      // For keywords: determine where they already exist to know where to patch
      let keywordLocations: ("desktop" | "metainfo" | "appdata")[] = [];
      if (acceptedMetadata.keywords) {
        keywordLocations = metadataFiles
          .filter((file) => filePatcher.hasKeywords(file))
          .map((file) => file.type);

        if (keywordLocations.length > 0) {
          console.log(
            `\n🔍 Found existing keywords in: ${
              keywordLocations
                .map((t) => (t === "desktop" ? ".desktop" : `.${t}.xml`))
                .join(", ")
            }`,
          );
        } else {
          // No existing keywords - prefer XML files if available
          console.log("\n🔍 No existing keywords found");
        }
      }

      for (const file of metadataFiles) {
        let patchedContent = file.content;
        let hasChanges = false;

        // Apply patches only for accepted metadata
        if (acceptedMetadata.keywords && keywords.length > 0) {
          let shouldPatchKeywords = false;

          if (keywordLocations.length > 0) {
            // Keywords exist somewhere - patch only where they already exist
            shouldPatchKeywords = keywordLocations.includes(file.type);
            if (!shouldPatchKeywords) {
              console.log(
                `   ⏭️  Skipped keywords for ${file.path} (keywords exist elsewhere)`,
              );
            }
          } else {
            // No existing keywords - prefer XML files, fallback to .desktop
            if (hasAppstreamFiles) {
              // Only patch XML files if they exist
              shouldPatchKeywords = file.type === "metainfo" ||
                file.type === "appdata";
              if (file.type === "desktop") {
                console.log(
                  `   ⏭️  Skipped keywords for ${file.path} (appstream file exists)`,
                );
              }
            } else {
              // No XML files, patch .desktop file
              shouldPatchKeywords = true;
            }
          }

          if (shouldPatchKeywords) {
            patchedContent = filePatcher.patchKeywords(file, keywords);
            hasChanges = true;
            console.log(`   ✓ Applied keywords to: ${file.path}`);
          }
        }

        if (acceptedMetadata.summary) {
          const tempFile = { ...file, content: patchedContent };
          patchedContent = filePatcher.patchSummary(tempFile, summary);
          hasChanges = true;
          console.log(`   - Applied summary to: ${file.path}`);
        }

        if (acceptedMetadata.description) {
          const tempFile = { ...file, content: patchedContent };
          patchedContent = filePatcher.patchDescription(tempFile, description);
          hasChanges = true;
          console.log(`   - Applied description to: ${file.path}`);
        }

        if (hasChanges) {
          await filePatcher.writeFile(file.path, patchedContent);
          console.log(`✅ Patched: ${file.path}`);
        } else {
          console.log(`⏭️  Skipped: ${file.path} (no accepted changes)`);
        }
      }

      // Step 7: Create branch and commit
      console.log("\n🌿 Creating branch and committing changes...");
      const branchName = `${mode}-${Date.now()}`;
      await repoManager.createBranch(repoPath, branchName);
      await repoManager.commitChanges(repoPath, commitMessage);
      console.log(`✅ Created branch: ${branchName}`);

      // Step 8: Push branch (handle fork if necessary)
      let headOverride: string | undefined;

      // Build GitLab token map for different instances
      const gitlabTokens = new Map<string, string>();
      if (GITLAB_TOKEN) gitlabTokens.set("gitlab.com", GITLAB_TOKEN);
      if (GITLAB_GNOME_TOKEN) {
        gitlabTokens.set("gitlab.gnome.org", GITLAB_GNOME_TOKEN);
      }
      if (GITLAB_KDE_TOKEN) {
        gitlabTokens.set("invent.kde.org", GITLAB_KDE_TOKEN);
      }
      if (GITLAB_FREEDESKTOP_TOKEN) {
        gitlabTokens.set("gitlab.freedesktop.org", GITLAB_FREEDESKTOP_TOKEN);
      }

      const prManager = new PRManager(
        GITHUB_TOKEN,
        gitlabTokens,
        CODEBERG_TOKEN,
      );

      // Detect platform
      let platform: "github" | "gitlab" | "codeberg" | "unknown" = "unknown";
      try {
        const parsed = prManager.parseRepoUrl(repoUrl);
        platform = parsed.platform;
      } catch (_) {
        // If parsing fails, try to guess from URL
        if (repoUrl.includes("github.com")) platform = "github";
        else if (repoUrl.includes("gitlab")) platform = "gitlab";
        else if (repoUrl.includes("codeberg.org")) platform = "codeberg";
      }

      if (platform === "github" && GITHUB_TOKEN) {
        try {
          const { owner, repo } = prManager.parseGitHubRepoUrl(repoUrl);
          let userLogin = "";
          try {
            userLogin = await prManager.getGitHubUser();
          } catch (e) {
            console.warn(
              `⚠️  Could not determine GitHub user: ${
                e instanceof Error ? e.message : e
              }`,
            );
          }

          // Helper: poll fork readiness
          const waitForForkReady = async (
            forkOwner: string,
            repo: string,
            attempts = 10,
            intervalMs = 2000,
          ) => {
            for (let i = 0; i < attempts; i++) {
              try {
                const meta = await prManager.getGitHubRepoMetadata(
                  `https://github.com/${forkOwner}/${repo}`,
                );
                if (meta.default_branch) return true;
              } catch (_) {
                // ignore until last attempt
              }
              await new Promise((r) => setTimeout(r, intervalMs));
            }
            return false;
          };

          // Helper: push with retries (for transient 503 or not found)
          const pushWithRetries = async (
            remote: string,
            maxAttempts = 5,
          ): Promise<void> => {
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              try {
                await repoManager.pushBranch(repoPath, remote, branchName);
                return;
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (attempt === maxAttempts) {
                  throw new Error(
                    `Failed to push after ${maxAttempts} attempts: ${msg}`,
                  );
                }
                const backoff = attempt * 2000;
                console.warn(
                  `⚠️  Push attempt ${attempt} failed (${msg}). Retrying in ${backoff}ms...`,
                );
                await new Promise((r) => setTimeout(r, backoff));
              }
            }
          };

          // Determine default branch for later PR base
          let defaultBranch = "main";
          try {
            const meta = await prManager.getGitHubRepoMetadata(repoUrl);
            defaultBranch = meta.default_branch || "main";
          } catch (e) {
            console.warn(
              `⚠️  Could not fetch default branch, falling back to 'main': ${
                e instanceof Error ? e.message : e
              }`,
            );
          }

          // Store for PR creation override later
          const prBaseBranch = defaultBranch;

          if (userLogin && userLogin !== owner) {
            console.log(
              "\n🔀 Forking upstream repository (no direct push rights)...",
            );
            let forkOwner = userLogin;
            try {
              forkOwner = (await prManager.forkGitHubRepo(repoUrl)) ||
                userLogin;
              console.log(`✅ Fork available under: ${forkOwner}`);
            } catch (forkErr) {
              console.error(
                `❌ Fork failed: ${
                  forkErr instanceof Error ? forkErr.message : forkErr
                }`,
              );
              throw forkErr;
            }

            // Wait until fork API reports ready
            const ready = await waitForForkReady(forkOwner, repo);
            if (!ready) {
              console.warn(
                "⚠️  Fork readiness timeout, attempting push anyway...",
              );
            }

            const forkRemoteUrl = `https://github.com/${forkOwner}/${repo}.git`;
            await repoManager.addRemote(repoPath, "fork", forkRemoteUrl);
            console.log("🚚 Pushing branch to fork remote (with retries)...");
            await pushWithRetries("fork");
            console.log("✅ Pushed to fork");
            headOverride = `${forkOwner}:${branchName}`;
          } else {
            // Try direct push; on failure fork fallback
            try {
              console.log("🚚 Pushing branch to origin remote...");
              await pushWithRetries("origin");
              console.log("✅ Pushed to origin");
            } catch (directErr) {
              console.warn(
                `⚠️  Direct push failed (${
                  directErr instanceof Error ? directErr.message : directErr
                }). Attempting fork...`,
              );
              let forkOwnerFallback = userLogin || owner;
              try {
                forkOwnerFallback = (await prManager.forkGitHubRepo(repoUrl)) ||
                  forkOwnerFallback;
                console.log(`✅ Fork created: ${forkOwnerFallback}`);
              } catch (forkErr) {
                throw new Error(
                  `Failed to push branch & fork: ${
                    forkErr instanceof Error ? forkErr.message : forkErr
                  }`,
                );
              }
              const ready = await waitForForkReady(forkOwnerFallback, repo);
              if (!ready) {
                console.warn(
                  "⚠️  Fork readiness timeout, attempting push anyway...",
                );
              }
              const forkRemoteUrl =
                `https://github.com/${forkOwnerFallback}/${repo}.git`;
              await repoManager.addRemote(repoPath, "fork", forkRemoteUrl);
              await pushWithRetries("fork");
              headOverride = `${forkOwnerFallback}:${branchName}`;
              console.log("✅ Pushed to fork (fallback)");
            }
          }

          // Attach base branch override if discovered
          if (prBaseBranch !== "main") {
            // Replace static base later when creating PR
          }
        } catch (err) {
          console.error(
            `❌ GitHub push workflow failed: ${
              err instanceof Error ? err.message : err
            }`,
          );
        }
      } else if (platform === "gitlab" && gitlabTokens.size > 0) {
        // Check if we have a token for this specific GitLab instance
        const {
          hostname,
          owner: _owner,
          repo,
        } = prManager.parseRepoUrl(repoUrl);
        if (!gitlabTokens.has(hostname)) {
          console.warn(
            `⚠️  No GitLab token configured for ${hostname}. Skipping push.`,
          );
          console.log(
            `\nTo push to this GitLab instance, set the appropriate token:`,
          );
          console.log(`  - gitlab.com: GITLAB_TOKEN`);
          console.log(`  - gitlab.gnome.org: GITLAB_GNOME_TOKEN`);
          console.log(`  - invent.kde.org: GITLAB_KDE_TOKEN`);
          console.log(`  - gitlab.freedesktop.org: GITLAB_FREEDESKTOP_TOKEN`);
        } else {
          try {
            const gitlabToken = gitlabTokens.get(hostname);
            let userLogin = "";
            try {
              userLogin = await prManager.getGitLabUser(hostname);
            } catch (e) {
              console.warn(
                `⚠️  Could not determine GitLab user: ${
                  e instanceof Error ? e.message : e
                }`,
              );
            }

            // Helper: poll fork readiness
            const waitForForkReady = async (
              forkOwner: string,
              repo: string,
              attempts = 10,
              intervalMs = 2000,
            ) => {
              for (let i = 0; i < attempts; i++) {
                try {
                  const meta = await prManager.getGitLabRepoMetadata(
                    `https://${hostname}/${forkOwner}/${repo}`,
                  );
                  if (meta.default_branch) return true;
                } catch (_) {
                  // ignore until last attempt
                }
                await new Promise((r) => setTimeout(r, intervalMs));
              }
              return false;
            };

            // Helper: push with retries
            const pushWithRetries = async (
              remote: string,
              maxAttempts = 5,
            ): Promise<void> => {
              for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                  await repoManager.pushBranch(
                    repoPath,
                    remote,
                    branchName,
                    gitlabToken,
                  );
                  return;
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  if (attempt === maxAttempts) {
                    throw new Error(
                      `Failed to push after ${maxAttempts} attempts: ${msg}`,
                    );
                  }
                  const backoff = attempt * 2000;
                  console.warn(
                    `⚠️  Push attempt ${attempt} failed (${msg}). Retrying in ${backoff}ms...`,
                  );
                  await new Promise((r) => setTimeout(r, backoff));
                }
              }
            };

            // Always fork for GitLab (users typically don't have direct push rights)
            console.log("\n🔀 Forking GitLab repository...");
            let forkOwner = userLogin;
            try {
              forkOwner = (await prManager.forkGitLabRepo(repoUrl)) ||
                userLogin;
              console.log(`✅ Fork available under: ${forkOwner}`);
            } catch (forkErr) {
              console.error(
                `❌ Fork failed: ${
                  forkErr instanceof Error ? forkErr.message : forkErr
                }`,
              );
              throw forkErr;
            }

            // Wait until fork API reports ready
            const ready = await waitForForkReady(forkOwner, repo);
            if (!ready) {
              console.warn(
                "⚠️  Fork readiness timeout, attempting push anyway...",
              );
            }

            const forkRemoteUrl =
              `https://${hostname}/${forkOwner}/${repo}.git`;
            await repoManager.addRemote(
              repoPath,
              "fork",
              forkRemoteUrl,
              gitlabToken,
            );
            console.log("🚚 Pushing branch to fork remote (with retries)...");
            await pushWithRetries("fork");
            console.log("✅ Pushed to fork");
            headOverride = `${forkOwner}:${branchName}`;
          } catch (e) {
            console.error(
              `❌ Failed to push to GitLab: ${
                e instanceof Error ? e.message : e
              }`,
            );
            throw e;
          }
        }
      } else if (platform === "codeberg" && CODEBERG_TOKEN) {
        // For Codeberg, similar fork workflow as GitHub
        try {
          const { owner, repo } = prManager.parseRepoUrl(repoUrl);
          let userLogin = "";
          try {
            userLogin = await prManager.getCodebergUser();
          } catch (e) {
            console.warn(
              `⚠️  Could not determine Codeberg user: ${
                e instanceof Error ? e.message : e
              }`,
            );
          }

          // Helper: poll fork readiness for Codeberg
          const waitForForkReady = async (
            forkOwner: string,
            repo: string,
            attempts = 10,
            intervalMs = 2000,
          ) => {
            for (let i = 0; i < attempts; i++) {
              try {
                const meta = await prManager.getCodebergRepoMetadata(
                  `https://codeberg.org/${forkOwner}/${repo}`,
                );
                if (meta.default_branch) return true;
              } catch (_) {
                // ignore until last attempt
              }
              await new Promise((r) => setTimeout(r, intervalMs));
            }
            return false;
          };

          // Helper: push with retries
          const pushWithRetries = async (
            remote: string,
            maxAttempts = 5,
          ): Promise<void> => {
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              try {
                await repoManager.pushBranch(repoPath, remote, branchName);
                return;
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (attempt === maxAttempts) {
                  throw new Error(
                    `Failed to push after ${maxAttempts} attempts: ${msg}`,
                  );
                }
                const backoff = attempt * 2000;
                console.warn(
                  `⚠️  Push attempt ${attempt} failed (${msg}). Retrying in ${backoff}ms...`,
                );
                await new Promise((r) => setTimeout(r, backoff));
              }
            }
          };

          // Get default branch (not currently used for base branch but fetched for consistency)
          let _defaultBranch = "main";
          try {
            const meta = await prManager.getCodebergRepoMetadata(repoUrl);
            _defaultBranch = meta.default_branch || "main";
          } catch (e) {
            console.warn(
              `⚠️  Could not fetch default branch, falling back to 'main': ${
                e instanceof Error ? e.message : e
              }`,
            );
          }

          if (userLogin && userLogin !== owner) {
            console.log(
              "\n🔀 Forking upstream repository (no direct push rights)...",
            );
            let forkOwner = userLogin;
            try {
              forkOwner = (await prManager.forkCodebergRepo(repoUrl)) ||
                userLogin;
              console.log(`✅ Fork available under: ${forkOwner}`);
            } catch (forkErr) {
              console.error(
                `❌ Fork failed: ${
                  forkErr instanceof Error ? forkErr.message : forkErr
                }`,
              );
              throw forkErr;
            }

            const ready = await waitForForkReady(forkOwner, repo);
            if (!ready) {
              console.warn(
                "⚠️  Fork readiness timeout, attempting push anyway...",
              );
            }

            const forkRemoteUrl =
              `https://codeberg.org/${forkOwner}/${repo}.git`;
            await repoManager.addRemote(repoPath, "fork", forkRemoteUrl);
            console.log("🚚 Pushing branch to fork remote (with retries)...");
            await pushWithRetries("fork");
            console.log("✅ Pushed to fork");
            headOverride = `${forkOwner}:${branchName}`;
          } else {
            // Try direct push; on failure fork fallback
            try {
              console.log("🚚 Pushing branch to origin remote...");
              await pushWithRetries("origin");
              console.log("✅ Pushed to origin");
            } catch (directErr) {
              console.warn(
                `⚠️  Direct push failed (${
                  directErr instanceof Error ? directErr.message : directErr
                }). Attempting fork...`,
              );
              let forkOwnerFallback = userLogin || owner;
              try {
                forkOwnerFallback =
                  (await prManager.forkCodebergRepo(repoUrl)) ||
                  forkOwnerFallback;
                console.log(`✅ Fork created: ${forkOwnerFallback}`);
              } catch (forkErr) {
                throw new Error(
                  `Failed to push branch & fork: ${
                    forkErr instanceof Error ? forkErr.message : forkErr
                  }`,
                );
              }
              const ready = await waitForForkReady(forkOwnerFallback, repo);
              if (!ready) {
                console.warn(
                  "⚠️  Fork readiness timeout, attempting push anyway...",
                );
              }
              const forkRemoteUrl =
                `https://codeberg.org/${forkOwnerFallback}/${repo}.git`;
              await repoManager.addRemote(repoPath, "fork", forkRemoteUrl);
              await pushWithRetries("fork");
              headOverride = `${forkOwnerFallback}:${branchName}`;
              console.log("✅ Pushed to fork (fallback)");
            }
          }
        } catch (err) {
          console.error(
            `❌ Codeberg push workflow failed: ${
              err instanceof Error ? err.message : err
            }`,
          );
        }
      }

      // Step 9: Create pull request
      // Check if using non-default AppStream URL with Flathub repository
      if (!appStreamClient.isUsingDefaultUrl() && isFlathubRepo) {
        console.log(
          "\n⚠️  Cannot create PR: Using non-default AppStream URL with Flathub repository",
        );
        console.log(`   Current URL: ${APPSTREAM_URL || "custom URL"}`);
        console.log(
          `   Default URL: https://dl.flathub.org/repo/appstream/x86_64/appstream.xml.gz`,
        );
        console.log(
          "\n   PRs to Flathub repositories should only use the default AppStream data source.",
        );
        console.log(
          `\n   Changes are ready in branch '${branchName}' at: ${repoPath}`,
        );
        console.log("   You can manually review and push the changes.");
        console.log("\n✨ Done!\n");
        return;
      }

      let hasToken = false;
      if (platform === "github" && GITHUB_TOKEN) {
        hasToken = true;
      } else if (platform === "gitlab") {
        const { hostname } = prManager.parseRepoUrl(repoUrl);
        hasToken = gitlabTokens.has(hostname);
      } else if (platform === "codeberg" && CODEBERG_TOKEN) {
        hasToken = true;
      }

      if (!hasToken) {
        console.log(`\n⚠️  No ${platform.toUpperCase()} token configured`);
        console.log("Pull request creation skipped");
        console.log(
          `\nTo create PRs automatically, set ${platform.toUpperCase()}_TOKEN`,
        );
        console.log(
          `\nChanges are ready in branch '${branchName}' at: ${repoPath}`,
        );
        console.log("You can manually push and create a PR");
      } else {
        // Ask user if they want to create a PR
        console.log("\n" + "=".repeat(60));
        const createPRResponse = prompt(
          "Create pull request now? (y)es or (n)o: ",
        );
        console.log("=".repeat(60));

        if (
          createPRResponse === null ||
          createPRResponse.toLowerCase() === "n" ||
          createPRResponse.toLowerCase() === "no"
        ) {
          console.log("\n⏭️  Skipping pull request creation");
          console.log(
            `\nChanges are ready in branch '${branchName}' at: ${repoPath}`,
          );
          console.log("You can manually create a PR when ready");
        } else {
          console.log("\n🔄 Creating pull request...");
          // Attempt to detect default branch for more accuracy
          let baseBranch = "main";
          try {
            if (platform === "github" && GITHUB_TOKEN) {
              const meta = await prManager.getGitHubRepoMetadata(repoUrl);
              baseBranch = meta.default_branch || "main";
            } else if (platform === "gitlab") {
              const { hostname } = prManager.parseRepoUrl(repoUrl);
              if (gitlabTokens.has(hostname)) {
                const meta = await prManager.getGitLabRepoMetadata(repoUrl);
                baseBranch = meta.default_branch || "main";
              }
            } else if (platform === "codeberg" && CODEBERG_TOKEN) {
              const meta = await prManager.getCodebergRepoMetadata(repoUrl);
              baseBranch = meta.default_branch || "main";
            }
          } catch (_) {
            /* fallback to main */
          }
          const prUrl = await prManager.createPR(repoUrl, {
            title: prTitle,
            description: prDescription,
            branchName,
            baseBranch,
            headOverride,
          });
          console.log(`✅ Pull request created: ${prUrl}`);
        }
      }

      console.log("\n✨ Done!\n");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ Error: ${message}`);

      // In batch mode, continue to next app on error
      if (batchMode) {
        console.error(`Skipping ${appId} due to error\n`);
        continue;
      }

      Deno.exit(1);
    }
  } // End of for loop for batch processing

  // Batch mode summary
  if (batchMode) {
    console.log("\n" + "=".repeat(80));
    console.log(
      `✨ Batch processing complete! Processed ${appsToProcess.length} apps`,
    );
    console.log("=".repeat(80) + "\n");
  }
}

if (import.meta.main) {
  main();
}
