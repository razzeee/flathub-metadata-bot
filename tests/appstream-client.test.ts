import {
  AppStreamClient,
  getDescription,
  getKeywords,
} from "../src/appstream-client.ts";
import { assert, assertEquals, assertRejects } from "@std/assert";

Deno.test("AppStreamClient constructor", () => {
  const client = new AppStreamClient();
  assert(client instanceof AppStreamClient);
});

Deno.test("AppStreamClient.getAppstream fetches and parses XML", async () => {
  const client = new AppStreamClient();
  // This test relies on the real network request to Flathub
  // In a real CI environment, we might want to mock fetch
  const appstream = await client.getAppstream("org.gnome.Calculator");

  assertEquals(appstream.id, "org.gnome.Calculator");
  assert(appstream.name.length > 0);
  assert(appstream.summary.length > 0);
  assert(appstream.description !== undefined);
  assert(appstream.keywords !== undefined);
  assert(appstream.keywords.length > 0);
});

Deno.test("AppStreamClient.getAppstream throws for invalid app ID", async () => {
  const client = new AppStreamClient();
  await assertRejects(
    async () => {
      await client.getAppstream("org.invalid.AppId");
    },
    Error,
    "not found in appstream XML",
  );
});

Deno.test("getDescription returns description when present", () => {
  const mockAppstream: any = {
    description: "Test description",
  };
  assertEquals(getDescription(mockAppstream), "Test description");
});

Deno.test("getDescription returns undefined when missing", () => {
  const mockAppstream: any = {};
  assertEquals(getDescription(mockAppstream), undefined);
});

Deno.test("getKeywords returns keywords when present", () => {
  const mockAppstream: any = {
    keywords: ["one", "two"],
  };
  assertEquals(getKeywords(mockAppstream), ["one", "two"]);
});

Deno.test("getKeywords returns undefined when missing", () => {
  const mockAppstream: any = {};
  assertEquals(getKeywords(mockAppstream), undefined);
});

Deno.test("AppStreamClient uses custom URL", async () => {
  // This test is tricky without mocking fetch, but we can verify the property is set
  // by checking if it fails with a bad URL
  const client = new AppStreamClient("https://invalid.url/appstream.xml.gz");
  await assertRejects(
    async () => {
      await client.getAppstream("org.mozilla.Firefox");
    },
    Error,
    "error sending request",
  );
});

Deno.test("AppStreamClient.getRepositoryUrl extracts vcs_browser", () => {
  const client = new AppStreamClient();
  const appstream = {
    name: "Test App",
    urls: {
      vcs_browser: "https://github.com/test/repo",
    },
  } as any;

  const url = client.getRepositoryUrl(appstream);
  assertEquals(url, "https://github.com/test/repo");
});

Deno.test("AppStreamClient.getRepositoryUrl extracts gitlab.gnome.org from homepage", () => {
  const client = new AppStreamClient();
  const appstream = {
    name: "Test App",
    urls: {
      homepage: "https://gitlab.gnome.org/gnome/test-app",
    },
  } as any;

  const url = client.getRepositoryUrl(appstream);
  assertEquals(url, "https://gitlab.gnome.org/gnome/test-app");
});

Deno.test("AppStreamClient.getRepositoryUrl extracts invent.kde.org from bugtracker", () => {
  const client = new AppStreamClient();
  const appstream = {
    name: "Test App",
    urls: {
      bugtracker: "https://invent.kde.org/kde/test-app/-/issues",
    },
  } as any;

  const url = client.getRepositoryUrl(appstream);
  assertEquals(url, "https://invent.kde.org/kde/test-app");
});
