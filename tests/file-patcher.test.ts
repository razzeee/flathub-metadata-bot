/**
 * Test suite for FilePatcher
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { FilePatcher } from "../src/file-patcher.ts";
import type { MetadataFile } from "../src/repository-manager.ts";

Deno.test("FilePatcher - patchKeywords in desktop file", () => {
  const patcher = new FilePatcher();
  const file: MetadataFile = {
    path: "/test/app.desktop",
    type: "desktop",
    content: `[Desktop Entry]
Name=Test App
Exec=test-app
`,
  };

  const keywords = ["test", "sample", "demo"];
  const result = patcher.patchKeywords(file, keywords);

  assertStringIncludes(result, "Keywords=test;sample;demo;");
  assertStringIncludes(result, "[Desktop Entry]");
});

Deno.test(
  "FilePatcher - patchKeywords replaces existing keywords in desktop file",
  () => {
    const patcher = new FilePatcher();
    const file: MetadataFile = {
      path: "/test/app.desktop",
      type: "desktop",
      content: `[Desktop Entry]
Name=Test App
Keywords=old;keywords;
Exec=test-app
`,
    };

    const keywords = ["new", "keywords"];
    const result = patcher.patchKeywords(file, keywords);

    assertStringIncludes(result, "Keywords=new;keywords;");
    assertEquals(
      result.match(/Keywords=/g)?.length,
      1,
      "Should have exactly one Keywords line"
    );
  }
);

Deno.test("FilePatcher - patchKeywords in XML file", () => {
  const patcher = new FilePatcher();
  const file: MetadataFile = {
    path: "/test/app.metainfo.xml",
    type: "metainfo",
    content: `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop">
  <id>com.example.App</id>
  <name>Test App</name>
</component>
`,
  };

  const keywords = ["xml", "test", "metadata"];
  const result = patcher.patchKeywords(file, keywords);

  assertStringIncludes(result, "<keywords>");
  assertStringIncludes(result, "<keyword>xml</keyword>");
  assertStringIncludes(result, "<keyword>test</keyword>");
  assertStringIncludes(result, "<keyword>metadata</keyword>");
  assertStringIncludes(result, "</keywords>");
});

Deno.test("FilePatcher - patchSummary in XML file", () => {
  const patcher = new FilePatcher();
  const file: MetadataFile = {
    path: "/test/app.metainfo.xml",
    type: "metainfo",
    content: `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop">
  <id>com.example.App</id>
  <name>Test App</name>
</component>
`,
  };

  const summary = "A test application for demonstration";
  const result = patcher.patchSummary(file, summary);

  assertStringIncludes(result, "<summary>");
  assertStringIncludes(result, summary);
  assertStringIncludes(result, "</summary>");
});

Deno.test("FilePatcher - patchSummary skips desktop files", () => {
  const patcher = new FilePatcher();
  const originalContent = `[Desktop Entry]
Name=Test App
`;
  const file: MetadataFile = {
    path: "/test/app.desktop",
    type: "desktop",
    content: originalContent,
  };

  const summary = "This should not be added";
  const result = patcher.patchSummary(file, summary);

  assertEquals(result, originalContent, "Content should remain unchanged");
});

Deno.test("FilePatcher - patchDescription in XML file", () => {
  const patcher = new FilePatcher();
  const file: MetadataFile = {
    path: "/test/app.metainfo.xml",
    type: "metainfo",
    content: `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop">
  <id>com.example.App</id>
  <name>Test App</name>
</component>
`,
  };

  const description =
    "This is a comprehensive description of the test application.";
  const result = patcher.patchDescription(file, description);

  assertStringIncludes(result, "<description>");
  assertStringIncludes(result, "<p>");
  assertStringIncludes(result, description);
  assertStringIncludes(result, "</p>");
  assertStringIncludes(result, "</description>");
});

Deno.test("FilePatcher - patchDescription skips desktop files", () => {
  const patcher = new FilePatcher();
  const originalContent = `[Desktop Entry]
Name=Test App
`;
  const file: MetadataFile = {
    path: "/test/app.desktop",
    type: "desktop",
    content: originalContent,
  };

  const description = "This should not be added";
  const result = patcher.patchDescription(file, description);

  assertEquals(result, originalContent, "Content should remain unchanged");
});
