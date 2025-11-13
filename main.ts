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
        console.log("\n📝 Generating description...");
        description = await metadataGenerator.generateDescription(appstream);

        console.log(`✅ Generated description (${description.length} chars):`);
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
        `**Generated keywords:**\n${
          keywords
            .map((k: string) => `- ${k}`)
            .join("\n")
        }`,
      );
    }
    if (acceptedMetadata.summary) {
      acceptedItems.push(`Summary: ${summary}`);
      acceptedChanges.push(`**Generated summary:**\n> ${summary}`);
    }
    if (acceptedMetadata.description) {
      acceptedItems.push(`Description: Updated`);
      acceptedChanges.push(`**Generated description:**\n\n${description}`);
    }

    const commitMessage =
      `Update metadata for ${appId}\n\nAutomatically generated:\n${
        acceptedItems
          .map((item) => `- ${item}`)
          .join("\n")
      }`;
    const prTitle = `Update metadata for ${appId}`;
    const prDescription =
      `This PR updates the metadata to improve discoverability and user experience for ${appstream.name}.\n\n${
        acceptedChanges.join("\n\n")
      }\n\nGenerated by Metadata Bot 🤖`;

    // User accepted at least one value, proceed with repo operations
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

    // Step 5: Patch files with accepted metadata
    console.log(`\n✏️  Patching files with accepted metadata...`);
    const filePatcher = new FilePatcher();

    // Check if we have appstream XML files (prioritize them over .desktop files)
    const hasAppstreamFiles = metadataFiles.some(
      (file) => file.type === "metainfo" || file.type === "appdata",
    );

    for (const file of metadataFiles) {
      let patchedContent = file.content;
      let hasChanges = false;

      // Apply patches only for accepted metadata
      if (acceptedMetadata.keywords) {
        // Skip .desktop files for keywords if we have appstream XML files
        if (file.type === "desktop" && hasAppstreamFiles) {
          console.log(
            `   ⏭️  Skipped keywords for ${file.path} (appstream file exists)`,
          );
        } else {
          patchedContent = filePatcher.patchKeywords(file, keywords);
          hasChanges = true;
          console.log(`   - Applied keywords to: ${file.path}`);
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

    // Step 8: Push branch (handle fork if necessary for GitHub)
    let headOverride: string | undefined;
    if (GITHUB_TOKEN && repoUrl.includes("github.com")) {
      const prManager = new PRManager(GITHUB_TOKEN, GITLAB_TOKEN);
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
        async function waitForForkReady(
          forkOwner: string,
          repo: string,
          attempts = 10,
          intervalMs = 2000,
        ) {
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
        }

        // Helper: push with retries (for transient 503 or not found)
        async function pushWithRetries(
          remote: string,
          maxAttempts = 5,
        ): Promise<void> {
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
        }

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
            forkOwner = (await prManager.forkGitHubRepo(repoUrl)) || userLogin;
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
    } else if (GITLAB_TOKEN && repoUrl.includes("gitlab.com")) {
      // For GitLab assume direct push rights; if not it will error out.
      try {
        console.log("🚚 Pushing branch to origin remote (GitLab)...");
        await repoManager.pushBranch(repoPath, "origin", branchName);
        console.log("✅ Pushed to origin");
      } catch (e) {
        console.error(
          `❌ Failed to push to GitLab: ${e instanceof Error ? e.message : e}`,
        );
        throw e;
      }
    }

    // Step 9: Create pull request
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
      // Attempt to detect default branch again (if GitHub) for more accuracy
      let baseBranch = "main";
      if (GITHUB_TOKEN && repoUrl.includes("github.com")) {
        try {
          const meta = await prManager.getGitHubRepoMetadata(repoUrl);
          baseBranch = meta.default_branch || "main";
        } catch (_) {
          /* fallback to main */
        }
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
