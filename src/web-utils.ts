import { DOMParser } from "jsr:@b-fuze/deno-dom";

/**
 * Web utilities: extract URLs from appstream data and fetch their content.
 */
export function extractAppstreamUrls(appstream: {
  urls?: Record<string, string | null>;
}): string[] {
  if (!appstream.urls) return [];

  // Collect any values in the urls object that look like http(s) URLs.
  // This makes the extractor generic and tolerant of future/unknown keys.
  const candidates = Object.values(appstream.urls).filter(
    (v): v is string =>
      typeof v === "string" && v.trim().length > 0 && /^https?:\/\//i.test(v),
  );

  // Normalize and dedupe while preserving order
  const seen = new Set<string>();
  const results: string[] = [];
  for (const raw of candidates) {
    const url = raw.trim();
    if (!seen.has(url)) {
      seen.add(url);
      results.push(url);
    }
  }
  return results;
}

export async function fetchWebsitesContent(
  urls: string[],
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  for (const url of urls) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const html = await resp.text();

      let text = "";
      // Use the statically imported DOMParser to parse HTML and extract main content.
      try {
        const doc = new DOMParser().parseFromString(html, "text/html");
        if (doc) {
          const main = doc.querySelector("main") ||
            doc.querySelector("article");
          if (main) {
            text = main.textContent || "";
          } else {
            const nodes = Array.from(doc.querySelectorAll("p, li, h1, h2, h3"));
            const blocks = nodes
              .map((n: any) => (n.textContent || "").trim())
              .filter((s: string) => s.length > 0);
            if (blocks.length > 0) {
              text = blocks.join("\n\n");
            } else {
              const body = doc.querySelector("body");
              text = body ? body.textContent || "" : "";
            }
          }
        }
      } catch {
        text = "";
      }

      if (!text || text.trim().length === 0) {
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        text = bodyMatch ? bodyMatch[1] : html;
        text = text
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      text = text.replace(/\s+/g, " ").trim();
      results[url] = text.slice(0, 5000);
    } catch {
      // ignore
    }
  }

  return results;
}
