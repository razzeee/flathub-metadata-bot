/**
 * Batch Processor - Orchestrates batch processing of apps from appstream catalogue
 */

import { AppStreamClient, type AppstreamData } from "./appstream-client.ts";
import { ProgressTracker } from "./progress-tracker.ts";

export interface BatchProcessorOptions {
  appstreamUrl?: string;
  skipWithKeywords?: boolean;
  autoMarkProcessed?: boolean;
  onAppProcess?: (appId: string, appstream: AppstreamData) => Promise<void>;
  onAppSkipped?: (appId: string, reason: string) => void;
  onAppError?: (appId: string, error: Error) => void;
}

export class BatchProcessor {
  private appStreamClient: AppStreamClient;
  private progressTracker: ProgressTracker;
  private skipWithKeywords: boolean;
  private autoMarkProcessed: boolean;
  private onAppProcess?: (
    appId: string,
    appstream: AppstreamData,
  ) => Promise<void>;
  private onAppSkipped?: (appId: string, reason: string) => void;
  private onAppError?: (appId: string, error: Error) => void;

  constructor(options: BatchProcessorOptions = {}) {
    this.appStreamClient = new AppStreamClient(options.appstreamUrl);
    this.progressTracker = new ProgressTracker();
    this.skipWithKeywords = options.skipWithKeywords || false;
    this.autoMarkProcessed = options.autoMarkProcessed ?? true;
    this.onAppProcess = options.onAppProcess;
    this.onAppSkipped = options.onAppSkipped;
    this.onAppError = options.onAppError;
  }

  /**
   * Run batch processing
   */
  async run(): Promise<void> {
    console.log("\n🚀 Starting batch processing...\n");

    // Load progress
    await this.progressTracker.load();

    // Fetch all apps from catalogue
    console.log("📥 Fetching apps from catalogue...");
    const filterTypes = [
      "desktop",
      "desktop-application",
      "console",
      "console-application",
    ];
    const allApps = await this.appStreamClient.getAllApps(filterTypes);
    console.log(`✅ Found ${allApps.length} desktop/console apps\n`);

    // Filter and process apps
    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const app of allApps) {
      const appId = app.id;

      // Skip if already processed
      if (this.progressTracker.isProcessed(appId)) {
        console.log(`⏭️  Skipping ${appId} (already processed)`);
        skippedCount++;
        continue;
      }

      // Skip if has keywords and flag is set
      if (this.skipWithKeywords && app.keywords && app.keywords.length > 0) {
        console.log(
          `⏭️  Skipping ${appId} (has ${app.keywords.length} keywords)`,
        );
        if (this.onAppSkipped) {
          this.onAppSkipped(appId, "has-keywords");
        }
        skippedCount++;
        continue;
      }

      // Skip if we can't extract a repository URL
      const repositoryUrl = this.appStreamClient.getRepositoryUrl(app);
      if (!repositoryUrl) {
        console.log(`⏭️  Skipping ${appId} (no repository URL found)`);
        if (this.onAppSkipped) {
          this.onAppSkipped(appId, "no-repository");
        }
        skippedCount++;
        continue;
      }

      // Process the app
      try {
        if (this.onAppProcess) {
          await this.onAppProcess(appId, app);
        }

        // Mark as processed
        if (this.autoMarkProcessed) {
          await this.progressTracker.markProcessed(appId);
        }
        processedCount++;
      } catch (error) {
        errorCount++;
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`\n❌ Error processing ${appId}: ${err.message}\n`);

        if (this.onAppError) {
          this.onAppError(appId, err);
        }

        // Continue with next app
        continue;
      }
    }

    // Print summary
    console.log("\n" + "=".repeat(80));
    console.log("📊 Batch Processing Summary");
    console.log("=".repeat(80));
    console.log(`Total apps in catalogue: ${allApps.length}`);
    console.log(`Processed in this run: ${processedCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(
      `Total processed (all time): ${this.progressTracker.getProcessedCount()}`,
    );
    console.log("=".repeat(80) + "\n");
  }

  /**
   * Get progress tracker instance
   */
  getProgressTracker(): ProgressTracker {
    return this.progressTracker;
  }
}
