/**
 * Integration test for keyword detection and placement logic
 */

import { assertEquals } from "@std/assert";
import { FilePatcher } from "../src/file-patcher.ts";
import type { MetadataFile } from "../src/repository-manager.ts";

Deno.test(
  "Scenario: Keywords exist in .desktop file only - should replace them",
  () => {
    const patcher = new FilePatcher();

    const desktopFile: MetadataFile = {
      path: "/test/app.desktop",
      type: "desktop",
      content: `[Desktop Entry]
Name=Test App
Keywords=existing;keywords;
Exec=test-app
`,
    };

    const xmlFile: MetadataFile = {
      path: "/test/app.metainfo.xml",
      type: "metainfo",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop">
  <id>com.example.App</id>
  <name>Test App</name>
</component>
`,
    };

    const files = [desktopFile, xmlFile];

    // Detect where keywords exist
    const hasKeywordsInDesktop = patcher.hasKeywords(desktopFile);
    const hasKeywordsInXml = patcher.hasKeywords(xmlFile);

    assertEquals(hasKeywordsInDesktop, true);
    assertEquals(hasKeywordsInXml, false);

    // Keywords should replace existing ones in desktop file
    const newKeywords = ["new", "additional"];
    const patchedDesktop = patcher.patchKeywords(desktopFile, newKeywords);

    // Should contain only new keywords (old ones replaced)
    assertEquals(patchedDesktop.includes("existing"), false);
    assertEquals(patchedDesktop.includes("new"), true);
    assertEquals(patchedDesktop.includes("additional"), true);
  }
);

Deno.test(
  "Scenario: Keywords exist in XML file only - should replace them",
  () => {
    const patcher = new FilePatcher();

    const desktopFile: MetadataFile = {
      path: "/test/app.desktop",
      type: "desktop",
      content: `[Desktop Entry]
Name=Test App
Exec=test-app
`,
    };

    const xmlFile: MetadataFile = {
      path: "/test/app.metainfo.xml",
      type: "metainfo",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop">
  <id>com.example.App</id>
  <name>Test App</name>
  <keywords>
    <keyword>existing</keyword>
    <keyword>keywords</keyword>
  </keywords>
</component>
`,
    };

    // Detect where keywords exist
    const hasKeywordsInDesktop = patcher.hasKeywords(desktopFile);
    const hasKeywordsInXml = patcher.hasKeywords(xmlFile);

    assertEquals(hasKeywordsInDesktop, false);
    assertEquals(hasKeywordsInXml, true);

    // Keywords should replace existing ones in XML file
    const newKeywords = ["new", "additional"];
    const patchedXml = patcher.patchKeywords(xmlFile, newKeywords);

    // Should contain only new keywords (old ones replaced)
    assertEquals(patchedXml.includes("<keyword>existing</keyword>"), false);
    assertEquals(patchedXml.includes("<keyword>new</keyword>"), true);
    assertEquals(patchedXml.includes("<keyword>additional</keyword>"), true);
  }
);

Deno.test("Scenario: Keywords exist in BOTH files - should replace in both", () => {
  const patcher = new FilePatcher();

  const desktopFile: MetadataFile = {
    path: "/test/app.desktop",
    type: "desktop",
    content: `[Desktop Entry]
Name=Test App
Keywords=desktop;keywords;
Exec=test-app
`,
  };

  const xmlFile: MetadataFile = {
    path: "/test/app.metainfo.xml",
    type: "metainfo",
    content: `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop">
  <id>com.example.App</id>
  <name>Test App</name>
  <keywords>
    <keyword>xml</keyword>
    <keyword>keywords</keyword>
  </keywords>
</component>
`,
  };

  // Detect where keywords exist
  const hasKeywordsInDesktop = patcher.hasKeywords(desktopFile);
  const hasKeywordsInXml = patcher.hasKeywords(xmlFile);

  assertEquals(hasKeywordsInDesktop, true);
  assertEquals(hasKeywordsInXml, true);

  // Keywords should replace existing ones in both files
  const newKeywords = ["new", "additional"];
  const patchedDesktop = patcher.patchKeywords(desktopFile, newKeywords);
  const patchedXml = patcher.patchKeywords(xmlFile, newKeywords);

  // Desktop should contain only new keywords (old ones replaced)
  assertEquals(patchedDesktop.includes("desktop"), false);
  assertEquals(patchedDesktop.includes("new"), true);

  // XML should contain only new keywords (old ones replaced)
  assertEquals(patchedXml.includes("<keyword>xml</keyword>"), false);
  assertEquals(patchedXml.includes("<keyword>new</keyword>"), true);
});

Deno.test("Scenario: No keywords exist - prefer XML file if available", () => {
  const patcher = new FilePatcher();

  const desktopFile: MetadataFile = {
    path: "/test/app.desktop",
    type: "desktop",
    content: `[Desktop Entry]
Name=Test App
Exec=test-app
`,
  };

  const xmlFile: MetadataFile = {
    path: "/test/app.metainfo.xml",
    type: "metainfo",
    content: `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop">
  <id>com.example.App</id>
  <name>Test App</name>
</component>
`,
  };

  // Detect where keywords exist
  const hasKeywordsInDesktop = patcher.hasKeywords(desktopFile);
  const hasKeywordsInXml = patcher.hasKeywords(xmlFile);

  assertEquals(hasKeywordsInDesktop, false);
  assertEquals(hasKeywordsInXml, false);

  // According to Flathub guidelines, prefer XML file when available
  const hasAppstreamFiles = true; // xmlFile exists

  // Only patch XML file in this scenario (this would be the logic in main.ts)
  const newKeywords = ["new", "keywords"];
  const patchedXml = patcher.patchKeywords(xmlFile, newKeywords);

  // XML should now have keywords
  assertEquals(patchedXml.includes("<keyword>new</keyword>"), true);
  assertEquals(patchedXml.includes("<keyword>keywords</keyword>"), true);
});

Deno.test(
  "Scenario: Keywords with attributes - should be detected and replaced while preserving attributes",
  () => {
    const patcher = new FilePatcher();

    const xmlFile: MetadataFile = {
      path: "/test/app.metainfo.xml",
      type: "metainfo",
      content: `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop">
  <id>com.example.App</id>
  <name>Test App</name>
  <keywords xml:lang="en">
    <keyword>existing</keyword>
  </keywords>
</component>
`,
    };

    // Should detect keywords despite attributes
    const hasKeywords = patcher.hasKeywords(xmlFile);
    assertEquals(hasKeywords, true);

    // Should extract existing keywords
    const existing = patcher.getExistingKeywords(xmlFile);
    assertEquals(existing.includes("existing"), true);

    // Should replace keywords while preserving attributes
    const newKeywords = ["new"];
    const patched = patcher.patchKeywords(xmlFile, newKeywords);

    // Check if attribute is preserved
    assertEquals(patched.includes('<keywords xml:lang="en">'), true);
    // Old keywords should be replaced
    assertEquals(patched.includes("<keyword>existing</keyword>"), false);
    assertEquals(patched.includes("<keyword>new</keyword>"), true);
  }
);
