import { assertEquals, assertObjectMatch } from "@std/assert";
import {
  extractAppstreamUrls,
  fetchWebsitesContent,
} from "../src/web-utils.ts";

Deno.test("extractAppstreamUrls returns urls", () => {
  const appstream = {
    urls: {
      homepage: "https://example.com",
      vcs_browser: null,
      bugtracker: "https://github.com/user/repo/issues",
    },
  } as unknown as any;

  const urls = extractAppstreamUrls(appstream);
  assertEquals(urls.length, 2);
  assertEquals(urls[0], "https://example.com");
  assertEquals(urls[1], "https://github.com/user/repo/issues");
});

Deno.test("fetchWebsitesContent fetches and trims content", async () => {
  // Mock fetch
  const originalFetch = globalThis.fetch;
  // Simple HTML response
  (globalThis as any).fetch = (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => {
    return Promise.resolve(
      new Response(`<html><body><main><p>Hello world</p></main></body></html>`)
    );
  };

  const res = await fetchWebsitesContent(["https://example.com"]);
  assertEquals(Object.keys(res).length, 1);
  const txt = res["https://example.com"];
  // Should include "Hello world"
  if (!txt.includes("Hello world"))
    throw new Error("expected Hello world in fetched text");

  (globalThis as any).fetch = originalFetch;
});
