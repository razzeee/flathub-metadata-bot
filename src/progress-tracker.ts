/**
 * Progress Tracker - Manages tracking of processed apps for batch operations
 * Stores app IDs that have had PRs created to support resume/abort functionality
 */

export interface ProgressData {
  processedAppIds: string[];
  lastUpdated: string;
}

export class ProgressTracker {
  private processedAppIds: Set<string>;
  private filePath: string;

  constructor(filePath = "processed_apps.json") {
    this.filePath = filePath;
    this.processedAppIds = new Set();
  }

  /**
   * Load progress from file
   * Creates empty progress if file doesn't exist
   */
  async load(): Promise<void> {
    try {
      const content = await Deno.readTextFile(this.filePath);
      const data: ProgressData = JSON.parse(content);
      this.processedAppIds = new Set(data.processedAppIds || []);
      console.log(
        `📂 Loaded progress: ${this.processedAppIds.size} apps already processed`,
      );
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        console.log("📂 No existing progress file found, starting fresh");
        this.processedAppIds = new Set();
      } else {
        throw new Error(
          `Failed to load progress file: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
  }

  /**
   * Save current progress to file
   */
  async save(): Promise<void> {
    const data: ProgressData = {
      processedAppIds: Array.from(this.processedAppIds),
      lastUpdated: new Date().toISOString(),
    };

    try {
      // Write atomically by writing to temp file first
      const tempPath = `${this.filePath}.tmp`;
      await Deno.writeTextFile(tempPath, JSON.stringify(data, null, 2));
      await Deno.rename(tempPath, this.filePath);
    } catch (error) {
      throw new Error(
        `Failed to save progress file: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /**
   * Check if an app has been processed
   */
  isProcessed(appId: string): boolean {
    return this.processedAppIds.has(appId);
  }

  /**
   * Mark an app as processed and save
   */
  async markProcessed(appId: string): Promise<void> {
    this.processedAppIds.add(appId);
    await this.save();
  }

  /**
   * Get count of processed apps
   */
  getProcessedCount(): number {
    return this.processedAppIds.size;
  }

  /**
   * Get all processed app IDs
   */
  getProcessedAppIds(): string[] {
    return Array.from(this.processedAppIds);
  }
}
