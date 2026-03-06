import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverLocales, getResDir, validateResDir } from "../locales.js";
import { parseStringsXml } from "../xml.js";

const resDirSchema = z.string().optional().describe("Path to the Android res/ directory. Defaults to ANDROID_RES_DIR env var.");

export function registerSearchStrings(server: McpServer): void {
  server.tool(
    "search_strings",
    "Search string resources by key pattern or value text. Returns matches across all locales.",
    {
      query: z.string().describe("Search query — matches against both keys and values"),
      searchIn: z.enum(["keys", "values", "both"]).optional().describe("Where to search. Default: both"),
      regex: z.boolean().optional().describe("Treat query as a regex pattern. Default: false"),
      locale: z.string().optional().describe("Limit value search to a specific locale (e.g. 'default', 'ru')"),
      limit: z.number().optional().describe("Max results to return. Default: 50"),
      resDir: resDirSchema,
    },
    async ({ query, searchIn, regex, locale, limit, resDir }) => {
      const dir = getResDir(resDir);
      const err = validateResDir(dir);
      if (err) return { content: [{ type: "text" as const, text: `Error: ${err}` }] };

      const locales = discoverLocales(dir);
      const searchLocales = locale ? locales.filter((l) => l.locale === locale) : locales;
      const maxResults = limit ?? 50;
      const where = searchIn ?? "both";

      let pattern: RegExp;
      try {
        pattern = regex ? new RegExp(query, "i") : new RegExp(escapeForRegex(query), "i");
      } catch {
        return { content: [{ type: "text" as const, text: `Error: Invalid regex pattern: ${query}` }] };
      }

      const matchedKeys = new Map<string, Map<string, string>>();

      for (const l of searchLocales) {
        const entries = parseStringsXml(l.filePath);
        for (const entry of entries) {
          const keyMatch = (where === "keys" || where === "both") && pattern.test(entry.name);
          const valueMatch = (where === "values" || where === "both") && pattern.test(entry.value);

          if (keyMatch || valueMatch) {
            if (!matchedKeys.has(entry.name)) matchedKeys.set(entry.name, new Map());
            matchedKeys.get(entry.name)!.set(l.locale, entry.value);
          }
        }
      }

      // If searching values in a specific locale, fill in other locales for matched keys
      if (locale && matchedKeys.size > 0) {
        const otherLocales = locales.filter((l) => l.locale !== locale);
        for (const l of otherLocales) {
          const entries = parseStringsXml(l.filePath);
          for (const entry of entries) {
            if (matchedKeys.has(entry.name)) {
              matchedKeys.get(entry.name)!.set(l.locale, entry.value);
            }
          }
        }
      }

      if (matchedKeys.size === 0) {
        return { content: [{ type: "text" as const, text: `No matches found for "${query}".` }] };
      }

      const results: string[] = [];
      let count = 0;
      for (const [key, localeValues] of matchedKeys) {
        if (count >= maxResults) {
          results.push(`\n... and ${matchedKeys.size - maxResults} more`);
          break;
        }
        results.push(`"${key}":`);
        for (const [loc, val] of localeValues) {
          results.push(`  ${loc}: ${val}`);
        }
        count++;
      }

      return { content: [{ type: "text" as const, text: `Found ${matchedKeys.size} match(es):\n${results.join("\n")}` }] };
    }
  );
}

function escapeForRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
