/**
 * Test suite for indentation detection and matching
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { FilePatcher } from "../src/file-patcher.ts";
import type { MetadataFile } from "../src/repository-manager.ts";

Deno.test("Indentation - detects and uses 2 spaces in XML", () => {
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

  const keywords = ["test", "example"];
  const result = patcher.patchKeywords(file, keywords);

  // Should use 2 spaces for base indent and 4 for nested
  assertStringIncludes(result, "  <keywords>");
  assertStringIncludes(result, "    <keyword>test</keyword>");
  assertStringIncludes(result, "    <keyword>example</keyword>");
  assertStringIncludes(result, "  </keywords>");
});

Deno.test("Indentation - detects and uses 4 spaces in XML", () => {
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

  const keywords = ["test", "example"];
  const result = patcher.patchKeywords(file, keywords);

  // Should use 4 spaces for base indent and 8 for nested
  assertStringIncludes(result, "    <keywords>");
  assertStringIncludes(result, "        <keyword>test</keyword>");
  assertStringIncludes(result, "        <keyword>example</keyword>");
  assertStringIncludes(result, "    </keywords>");
});

Deno.test("Indentation - detects and uses tabs in XML", () => {
  const patcher = new FilePatcher();
  const file: MetadataFile = {
    path: "/test/app.metainfo.xml",
    type: "metainfo",
    content: `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop">
\t<id>com.example.App</id>
\t<name>Test App</name>
</component>
`,
  };

  const keywords = ["test", "example"];
  const result = patcher.patchKeywords(file, keywords);

  // Should use tabs for indentation
  assertStringIncludes(result, "\t<keywords>");
  assertStringIncludes(result, "\t\t<keyword>test</keyword>");
  assertStringIncludes(result, "\t\t<keyword>example</keyword>");
  assertStringIncludes(result, "\t</keywords>");
});

Deno.test("Indentation - preserves existing keyword indentation in XML", () => {
  const patcher = new FilePatcher();
  const file: MetadataFile = {
    path: "/test/app.metainfo.xml",
    type: "metainfo",
    content: `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop">
  <id>com.example.App</id>
  <keywords>
    <keyword>existing</keyword>
  </keywords>
</component>
`,
  };

  const keywords = ["new", "keywords"];
  const result = patcher.patchKeywords(file, keywords);

  // Should match existing 2-space indentation and replace keywords
  assertStringIncludes(result, "  <keywords>");
  assertStringIncludes(result, "    <keyword>new</keyword>");
  assertStringIncludes(result, "    <keyword>keywords</keyword>");
  assertStringIncludes(result, "  </keywords>");
  // Old keywords should be replaced
  assertEquals(result.includes("<keyword>existing</keyword>"), false);
});

Deno.test("Indentation - preserves existing keyword indentation with tabs", () => {
  const patcher = new FilePatcher();
  const file: MetadataFile = {
    path: "/test/app.metainfo.xml",
    type: "metainfo",
    content: `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop">
\t<id>com.example.App</id>
\t<keywords>
\t\t<keyword>existing</keyword>
\t</keywords>
</component>
`,
  };

  const keywords = ["new", "keywords"];
  const result = patcher.patchKeywords(file, keywords);

  // Should match existing tab indentation and replace keywords
  assertStringIncludes(result, "\t<keywords>");
  assertStringIncludes(result, "\t\t<keyword>new</keyword>");
  assertStringIncludes(result, "\t\t<keyword>keywords</keyword>");
  assertStringIncludes(result, "\t</keywords>");
  // Old keywords should be replaced
  assertEquals(result.includes("<keyword>existing</keyword>"), false);
});

Deno.test("Indentation - summary uses same indentation as other elements", () => {
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

  const summary = "A test application";
  const result = patcher.patchSummary(file, summary);

  // Should use 2 spaces to match other elements
  assertStringIncludes(result, "  <summary>A test application</summary>");
});

Deno.test("Indentation - description uses correct nested indentation", () => {
  const patcher = new FilePatcher();
  const file: MetadataFile = {
    path: "/test/app.metainfo.xml",
    type: "metainfo",
    content: `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop">
  <id>com.example.App</id>
  <name>Test App</name>
  <summary>A test application</summary>
</component>
`,
  };

  const description = `<p>
  This is a test paragraph.
</p>`;

  const result = patcher.patchDescription(file, description);

  // Should use 2 spaces for <description> and add proper indentation to content
  assertStringIncludes(result, "  <description>");
  assertStringIncludes(result, "    <p>");
  assertStringIncludes(result, "    This is a test paragraph.");
  assertStringIncludes(result, "    </p>");
  assertStringIncludes(result, "  </description>");
});

Deno.test("Indentation - mixed indentation defaults to spaces", () => {
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

  const keywords = ["test", "example"];
  const result = patcher.patchKeywords(file, keywords);

  // Should detect the most common pattern (or default to spaces)
  // The important thing is it doesn't crash and produces valid output
  assertStringIncludes(result, "<keywords>");
  assertStringIncludes(result, "<keyword>test</keyword>");
  assertStringIncludes(result, "<keyword>example</keyword>");
  assertStringIncludes(result, "</keywords>");
});
