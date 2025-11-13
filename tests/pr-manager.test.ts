import { assertEquals, assertThrows } from "@std/assert";
import { PRManager } from "../src/pr-manager.ts";

Deno.test("parseGitHubRepoUrl handles dotted repo names", () => {
  const mgr = new PRManager({} as any);
  const { owner, repo } = mgr.parseGitHubRepoUrl(
    "https://github.com/flathub/net.filebot.FileBot"
  );
  assertEquals(owner, "flathub");
  assertEquals(repo, "net.filebot.FileBot");
});

Deno.test("parseGitHubRepoUrl strips .git suffix", () => {
  const mgr = new PRManager({} as any);
  const { owner, repo } = mgr.parseGitHubRepoUrl(
    "https://github.com/flathub/net.filebot.FileBot.git"
  );
  assertEquals(owner, "flathub");
  assertEquals(repo, "net.filebot.FileBot");
});

Deno.test("parseGitHubRepoUrl rejects invalid URL", () => {
  const mgr = new PRManager({} as any);
  assertThrows(() => mgr.parseGitHubRepoUrl("https://github.com/flathub"));
});
