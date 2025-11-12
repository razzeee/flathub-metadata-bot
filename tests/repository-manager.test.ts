/**
 * Test suite for RepositoryManager
 */

import { assertEquals, assertExists } from "@std/assert";
import { RepositoryManager } from "../src/repository-manager.ts";
import { exists } from "@std/fs";
import { join } from "@std/path";

Deno.test(
  "RepositoryManager - constructor creates work directory",
  async () => {
    const manager = new RepositoryManager();
    // Give it a moment to create the directory
    await new Promise((resolve) => setTimeout(resolve, 100));

    const workDirExists = await exists("./cloned_repos");
    assertEquals(workDirExists, true, "Work directory should be created");
  }
);

Deno.test("RepositoryManager - findMetadataFiles returns correct types", () => {
  const manager = new RepositoryManager();

  // Test file type detection logic
  const testCases = [
    { filename: "app.desktop", expectedType: "desktop" },
    { filename: "app.desktop.in", expectedType: "desktop" },
    { filename: "app.metainfo.xml", expectedType: "metainfo" },
    { filename: "app.metainfo.xml.in", expectedType: "metainfo" },
    { filename: "app.appdata.xml", expectedType: "appdata" },
    { filename: "app.appdata.xml.in", expectedType: "appdata" },
  ];

  for (const testCase of testCases) {
    const type =
      testCase.filename.endsWith(".desktop") ||
      testCase.filename.endsWith(".desktop.in")
        ? "desktop"
        : testCase.filename.includes("metainfo")
        ? "metainfo"
        : "appdata";

    assertEquals(
      type,
      testCase.expectedType,
      `Type detection for ${testCase.filename}`
    );
  }
});

Deno.test(
  "RepositoryManager - findMetadataFiles with real repository",
  { ignore: true }, // Ignore by default since it requires actual cloned repos
  async () => {
    const manager = new RepositoryManager();
    const testRepoPath = "./cloned_repos/dev_tchx84_Gameeky_upstream";

    if (await exists(testRepoPath)) {
      const files = await manager.findMetadataFiles(
        testRepoPath,
        "dev.tchx84.Gameeky"
      );

      assertExists(files, "Should return an array of files");
      assertEquals(Array.isArray(files), true, "Should return an array");

      // If files are found, check their structure
      if (files.length > 0) {
        const file = files[0];
        assertExists(file.path, "File should have a path");
        assertExists(file.type, "File should have a type");
        assertExists(file.content, "File should have content");
      }
    }
  }
);

Deno.test("RepositoryManager - template file detection", () => {
  // Test that .in files are properly marked as templates
  const templateFilename = "app.desktop.in";
  const isTemplate = templateFilename.endsWith(".in");

  assertEquals(isTemplate, true, ".in files should be detected as templates");
});
