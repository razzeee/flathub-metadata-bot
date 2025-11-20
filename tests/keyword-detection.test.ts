/**
 * Integration test for keyword detection and placement logic
 */

import { assertEquals } from "@std/assert";
import { FilePatcher } from "../src/file-patcher.ts";
import type { MetadataFile } from "../src/repository-manager.ts";

Deno.test("Scenario: Keywords exist in .desktop file only - should update there", () => {
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

  // Keywords should be added to desktop file only
  const newKeywords = ["new", "additional"];
  const patchedDesktop = patcher.patchKeywords(desktopFile, newKeywords);

  // Should contain both old and new
  assertEquals(patchedDesktop.includes("existing"), true);
  assertEquals(patchedDesktop.includes("new"), true);
  assertEquals(patchedDesktop.includes("additional"), true);
});

Deno.test("Scenario: Keywords exist in XML file only - should update there", () => {
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

  // Keywords should be added to XML file only
  const newKeywords = ["new", "additional"];
  const patchedXml = patcher.patchKeywords(xmlFile, newKeywords);

  // Should contain both old and new
  assertEquals(patchedXml.includes("<keyword>existing</keyword>"), true);
  assertEquals(patchedXml.includes("<keyword>new</keyword>"), true);
  assertEquals(patchedXml.includes("<keyword>additional</keyword>"), true);
});

Deno.test("Scenario: Keywords exist in BOTH files - should update both", () => {
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

  // Keywords should be added to both files
  const newKeywords = ["new", "additional"];
  const patchedDesktop = patcher.patchKeywords(desktopFile, newKeywords);
  const patchedXml = patcher.patchKeywords(xmlFile, newKeywords);

  // Desktop should contain its old keywords + new ones
  assertEquals(patchedDesktop.includes("desktop"), true);
  assertEquals(patchedDesktop.includes("new"), true);

  // XML should contain its old keywords + new ones
  assertEquals(patchedXml.includes("<keyword>xml</keyword>"), true);
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
