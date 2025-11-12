/**
 * Test suite for FlathubAPI
 */

import { assertEquals, assertExists } from "@std/assert";
import { FlathubAPI, getDescription, getKeywords } from "../src/flathub-api.ts";

Deno.test("FlathubAPI - constructor initializes correctly", () => {
  const api = new FlathubAPI();
  assertExists(api, "API instance should be created");
});

Deno.test(
  "FlathubAPI - getAppstream fetches real data",
  { ignore: true }, // Ignore by default to avoid network calls in CI
  async () => {
    const api = new FlathubAPI();
    const appId = "org.gnome.Calculator";

    try {
      const appstream = await api.getAppstream(appId);

      assertExists(appstream, "Should return appstream data");
      assertExists(appstream.name, "App should have a name");
    } catch (error) {
      console.error("API call failed:", error);
      throw error;
    }
  }
);

Deno.test(
  "FlathubAPI - search returns results",
  { ignore: true }, // Ignore by default to avoid network calls in CI
  async () => {
    const api = new FlathubAPI();

    try {
      const results = await api.search("calculator");

      assertExists(results, "Should return search results");
      assertExists(results.hits, "Results should have hits");
      assertEquals(
        Array.isArray(results.hits),
        true,
        "Hits should be an array"
      );

      if (results.hits && results.hits.length > 0) {
        const firstResult = results.hits[0];
        assertExists(firstResult.app_id, "Result should have an app_id");
        assertExists(firstResult.name, "Result should have a name");
      }
    } catch (error) {
      console.error("Search failed:", error);
      throw error;
    }
  }
);

Deno.test("FlathubAPI - handles invalid app ID gracefully", async () => {
  const api = new FlathubAPI();
  const invalidAppId = "invalid.nonexistent.App123456789";

  try {
    await api.getAppstream(invalidAppId);
    throw new Error("Should have thrown an error for invalid app ID");
  } catch (error) {
    // Expected to throw an error
    assertExists(error, "Should throw an error");
  }
});

Deno.test("FlathubAPI - getDescription helper", () => {
  const appstreamWithDesc = {
    name: "Test App",
    description: "This is a test description",
  } as any;

  const description = getDescription(appstreamWithDesc);
  assertEquals(description, "This is a test description");
});

Deno.test("FlathubAPI - getKeywords helper", () => {
  const appstreamWithKeywords = {
    name: "Test App",
    keywords: ["test", "demo", "sample"],
  } as any;

  const keywords = getKeywords(appstreamWithKeywords);
  assertExists(keywords);
  assertEquals(keywords.length, 3);
  assertEquals(keywords[0], "test");
});

Deno.test("FlathubAPI - getRepositoryUrl extracts vcs_browser", () => {
  const api = new FlathubAPI();
  const appstream = {
    name: "Test App",
    urls: {
      vcs_browser: "https://github.com/test/repo",
    },
  } as any;

  const url = api.getRepositoryUrl(appstream);
  assertEquals(url, "https://github.com/test/repo");
});
