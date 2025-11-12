#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read --allow-write --allow-run

/**
 * Metadata Bot - Main Entry Point
 * Automates keyword, summary, and description generation and PR creation for Flathub apps
 */

import { FlathubAPI } from "./src/flathub-api.ts";
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

async function main() {
  // Parse command line arguments
  const args = Deno.args;

  // Check for mode flag
  let mode: GenerationMode = "all"; // default mode - run all generators
  let appId: string | undefined;

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
    } else if (!appId) {
      appId = args[i];
    }
  }

  if (!appId) {
    console.error(
      "Usage: deno task dev [--mode <all|keywords|summary|description>] <app-id>",
    );
    console.error("Example: deno task dev org.mozilla.Firefox");
    console.error("Example: deno task dev --mode keywords org.mozilla.Firefox");
    console.error("Example: deno task dev --mode summary org.mozilla.Firefox");
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
  console.log();

  try {
    // Step 1: Fetch appstream data
    console.log("📥 Fetching appstream data from Flathub...");
    const flathubAPI = new FlathubAPI();
    const appstream = await flathubAPI.getAppstream(appId);
    console.log(`✅ Found: ${appstream.name}`);
    console.log(`   Summary: ${appstream.summary}`);

    // Step 2: Generate metadata based on mode
    const metadataGenerator = new MetadataGenerator({
      provider: LLM_PROVIDER,
      apiKey: OPENAI_API_KEY,
      modelName: LLM_MODEL,
      ollamaBaseUrl: OLLAMA_BASE_URL,
    });

    // Variables to store generated metadata (will be set in loop)
    let generatedContent:
      | string[]
      | string
      | { keywords: string[]; summary: string; description: string } = [];
    let commitMessage = "";
    let prTitle = "";
    let prDescription = "";
    let keywords: string[] = [];
    let summary = "";
    let description = "";

    // Generation loop - allow regeneration
    let accepted = false;
    while (!accepted) {
      if (mode === "all") {
        // Generate all metadata types
        console.log("\n🤖 Generating all metadata with AI...");

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

        console.log("\n📝 Generating summary...");
        summary = await metadataGenerator.generateSummary(appstream);
        console.log(`✅ Generated summary (${summary.length} chars):`);
        console.log(`   "${summary}"`);
        if (summary.length > 35) {
          console.warn(
            `   ⚠️  Warning: Summary exceeds 35 characters (${summary.length})`,
          );
        }

        console.log("\n📝 Generating description...");
        description = await metadataGenerator.generateDescription(appstream);
        console.log(`✅ Generated description (${description.length} chars):`);
        const lines = description.split("\n");
        lines.forEach((line) => console.log(`   ${line}`));

        generatedContent = { keywords, summary, description };
        commitMessage =
          `Update metadata for ${appId}\n\nAutomatically generated:\n- Keywords: ${
            keywords.join(
              ", ",
            )
          }\n- Summary: ${summary}\n- Description: Updated`;
        prTitle = `Update metadata for ${appId}`;
        prDescription =
          `This PR updates the metadata to improve discoverability and user experience for ${appstream.name}.\n\n**Generated keywords:**\n${
            keywords
              .map((k: string) => `- ${k}`)
              .join(
                "\n",
              )
          }\n\n**Generated summary:**\n> ${summary}\n\n**Generated description:**\n\n${description}\n\nGenerated by Metadata Bot 🤖`;
      } else if (mode === "keywords") {
        console.log("\n🤖 Generating keywords with AI...");
        keywords = await metadataGenerator.generateKeywords(appstream);

        // Validate that we have keywords
        if (keywords.length === 0) {
          console.error("\n❌ No keywords were generated!");
          console.error("The AI did not produce any valid keywords.");
          console.error("Please try again or check your LLM configuration.");
          Deno.exit(1);
        }

        console.log(`✅ Generated ${keywords.length} keywords:`);
        keywords.forEach((k, i) => console.log(`   ${i + 1}. ${k}`));

        generatedContent = keywords;
        commitMessage =
          `Add keywords to ${appId}\n\nAutomatically generated keywords:\n${
            keywords.join(
              ", ",
            )
          }`;
        prTitle = `Add keywords to ${appId}`;
        prDescription =
          `This PR adds automatically generated keywords to improve discoverability of ${appstream.name}.\n\n**Generated keywords:**\n${
            keywords
              .map((k: string) => `- ${k}`)
              .join("\n")
          }\n\nGenerated by Metadata Bot 🤖`;
      } else if (mode === "summary") {
        console.log("\n🤖 Generating summary with AI...");
        summary = await metadataGenerator.generateSummary(appstream);

        console.log(`✅ Generated summary (${summary.length} chars):`);
        console.log(`   "${summary}"`);

        if (summary.length > 35) {
          console.warn(
            `   ⚠️  Warning: Summary exceeds 35 characters (${summary.length})`,
          );
        }

        generatedContent = summary;
        commitMessage =
          `Update summary for ${appId}\n\nAutomatically generated summary:\n${summary}`;
        prTitle = `Update summary for ${appId}`;
        prDescription =
          `This PR updates the summary to improve discoverability and user experience for ${appstream.name}.\n\n**Generated summary:**\n> ${summary}\n\nGenerated by Metadata Bot 🤖`;
      } else {
        // mode === "description"
        console.log("\n🤖 Generating description with AI...");
        description = await metadataGenerator.generateDescription(appstream);

        console.log(`✅ Generated description (${description.length} chars):`);
        const lines = description.split("\n");
        lines.forEach((line) => console.log(`   ${line}`));

        generatedContent = description;
        commitMessage =
          `Update description for ${appId}\n\nAutomatically generated description`;
        prTitle = `Update description for ${appId}`;
        prDescription =
          `This PR updates the description to provide better information for users of ${appstream.name}.\n\n**Generated description:**\n\n${description}\n\nGenerated by Metadata Bot 🤖`;
      }

      // Ask user for confirmation
      console.log("\n" + "=".repeat(60));
      const response = prompt(
        "Accept these values? (y=yes, n=regenerate, q=quit): ",
      );
      console.log("=".repeat(60));

      if (response === null || response.toLowerCase() === "q") {
        console.log("\n👋 Cancelled by user");
        Deno.exit(0);
      } else if (response.toLowerCase() === "y") {
        accepted = true;
      } else {
        console.log("\n🔄 Regenerating...");
      }
    }

    // User accepted, proceed with repo operations
    const repoManager = new RepositoryManager();
    let metadataFiles: MetadataFile[] = [];
    let repoPath = "";
    let repoUrl = "";
    let isFlathubRepo = false;

    // Step 3: Try Flathub repository first
    console.log("\n📦 Checking Flathub repository...");
    const flathubRepoUrl = flathubAPI.getFlathubRepoUrl(appId);
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
        appId,
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
      const upstreamRepoUrl = flathubAPI.getRepositoryUrl(appstream);
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
        appId,
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
      repoUrl = upstreamRepoUrl;
      isFlathubRepo = false;
    }

    console.log(
      `\n📍 Using ${
        isFlathubRepo ? "Flathub" : "upstream"
      } repository for changes`,
    );

    // Step 5: Patch files with generated metadata
    console.log(`\n✏️  Patching files with ${mode}...`);
    const filePatcher = new FilePatcher();

    for (const file of metadataFiles) {
      let patchedContent = file.content;

      if (mode === "all") {
        // Apply all patches
        const allContent = generatedContent as {
          keywords: string[];
          summary: string;
          description: string;
        };
        patchedContent = filePatcher.patchKeywords(file, allContent.keywords);

        // Update file object with patched content for subsequent patches
        const tempFile = { ...file, content: patchedContent };
        patchedContent = filePatcher.patchSummary(tempFile, allContent.summary);

        // Update again for description patch
        const tempFile2 = { ...file, content: patchedContent };
        patchedContent = filePatcher.patchDescription(
          tempFile2,
          allContent.description,
        );
      } else if (mode === "keywords") {
        patchedContent = filePatcher.patchKeywords(
          file,
          generatedContent as string[],
        );
      } else if (mode === "summary") {
        patchedContent = filePatcher.patchSummary(
          file,
          generatedContent as string,
        );
      } else {
        // description
        patchedContent = filePatcher.patchDescription(
          file,
          generatedContent as string,
        );
      }

      await filePatcher.writeFile(file.path, patchedContent);
      console.log(`✅ Patched: ${file.path}`);
    }

    // Step 7: Create branch and commit
    console.log("\n🌿 Creating branch and committing changes...");
    const branchName = `${mode}-${Date.now()}`;
    await repoManager.createBranch(repoPath, branchName);
    await repoManager.commitChanges(repoPath, commitMessage);
    console.log(`✅ Created branch: ${branchName}`);

    // Step 8: Create pull request
    if (!GITHUB_TOKEN && !GITLAB_TOKEN) {
      console.log("\n⚠️  No GitHub or GitLab token configured");
      console.log("Pull request creation skipped");
      console.log(
        "\nTo create PRs automatically, set GITHUB_TOKEN or GITLAB_TOKEN",
      );
      console.log(
        `\nChanges are ready in branch '${branchName}' at: ${repoPath}`,
      );
      console.log("You can manually push and create a PR");
    } else {
      console.log("\n🔄 Creating pull request...");
      const prManager = new PRManager(GITHUB_TOKEN, GITLAB_TOKEN);

      const prUrl = await prManager.createPR(repoUrl, {
        title: prTitle,
        description: prDescription,
        branchName,
        baseBranch: "main",
      });

      console.log(`✅ Pull request created: ${prUrl}`);
    }

    console.log("\n✨ Done!\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Error: ${message}`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
