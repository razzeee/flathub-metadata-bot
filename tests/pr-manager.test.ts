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

Deno.test("parseRepoUrl detects GitHub", () => {
  const mgr = new PRManager();
  const meta = mgr.parseRepoUrl(
    "https://github.com/flathub/net.filebot.FileBot"
  );
  assertEquals(meta.platform, "github");
  assertEquals(meta.hostname, "github.com");
  assertEquals(meta.owner, "flathub");
  assertEquals(meta.repo, "net.filebot.FileBot");
});

Deno.test("parseRepoUrl detects GitLab.com", () => {
  const mgr = new PRManager();
  const meta = mgr.parseRepoUrl("https://gitlab.com/inkscape/inkscape");
  assertEquals(meta.platform, "gitlab");
  assertEquals(meta.hostname, "gitlab.com");
  assertEquals(meta.owner, "inkscape");
  assertEquals(meta.repo, "inkscape");
});

Deno.test("parseRepoUrl detects custom GitLab instance (GNOME)", () => {
  const mgr = new PRManager();
  const meta = mgr.parseRepoUrl(
    "https://gitlab.gnome.org/GNOME/gnome-terminal"
  );
  assertEquals(meta.platform, "gitlab");
  assertEquals(meta.hostname, "gitlab.gnome.org");
  assertEquals(meta.owner, "GNOME");
  assertEquals(meta.repo, "gnome-terminal");
});

Deno.test("parseRepoUrl detects custom GitLab instance (KDE)", () => {
  const mgr = new PRManager();
  const meta = mgr.parseRepoUrl("https://invent.kde.org/utilities/kate");
  assertEquals(meta.platform, "gitlab");
  assertEquals(meta.hostname, "invent.kde.org");
  assertEquals(meta.owner, "utilities");
  assertEquals(meta.repo, "kate");
});

Deno.test("parseRepoUrl detects custom GitLab instance (Freedesktop)", () => {
  const mgr = new PRManager();
  const meta = mgr.parseRepoUrl("https://gitlab.freedesktop.org/mesa/mesa");
  assertEquals(meta.platform, "gitlab");
  assertEquals(meta.hostname, "gitlab.freedesktop.org");
  assertEquals(meta.owner, "mesa");
  assertEquals(meta.repo, "mesa");
});

Deno.test("parseRepoUrl detects Codeberg", () => {
  const mgr = new PRManager();
  const meta = mgr.parseRepoUrl("https://codeberg.org/forgejo/forgejo");
  assertEquals(meta.platform, "codeberg");
  assertEquals(meta.hostname, "codeberg.org");
  assertEquals(meta.owner, "forgejo");
  assertEquals(meta.repo, "forgejo");
});

Deno.test("parseRepoUrl strips .git suffix from all platforms", () => {
  const mgr = new PRManager();

  const gh = mgr.parseRepoUrl("https://github.com/owner/repo.git");
  assertEquals(gh.repo, "repo");

  const gl = mgr.parseRepoUrl("https://gitlab.com/owner/repo.git");
  assertEquals(gl.repo, "repo");

  const cb = mgr.parseRepoUrl("https://codeberg.org/owner/repo.git");
  assertEquals(cb.repo, "repo");
});

Deno.test("parseRepoUrl handles dotted repo names on all platforms", () => {
  const mgr = new PRManager();

  const gh = mgr.parseRepoUrl("https://github.com/flathub/net.filebot.FileBot");
  assertEquals(gh.repo, "net.filebot.FileBot");

  const gl = mgr.parseRepoUrl(
    "https://gitlab.gnome.org/GNOME/org.gnome.Terminal"
  );
  assertEquals(gl.repo, "org.gnome.Terminal");

  const cb = mgr.parseRepoUrl("https://codeberg.org/forgejo/org.forgejo.App");
  assertEquals(cb.repo, "org.forgejo.App");
});

Deno.test("parseRepoUrl rejects unsupported platforms", () => {
  const mgr = new PRManager();
  assertThrows(() => mgr.parseRepoUrl("https://bitbucket.org/owner/repo"));
  assertThrows(() => mgr.parseRepoUrl("https://sourceforge.net/projects/repo"));
});
