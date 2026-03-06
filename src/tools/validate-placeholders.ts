import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverLocales, getResDir, validateResDir } from "../locales.js";
import { parseStringsXml, extractPlaceholders } from "../xml.js";

const resDirSchema = z.string().optional().describe("Path to the Android res/ directory. Defaults to ANDROID_RES_DIR env var.");

export function registerValidatePlaceholders(server: McpServer): void {
  server.tool(
    "validate_placeholders",
    "Check that format string placeholders (%s, %d, %1$s etc.) match across all locales. Mismatches cause runtime crashes.",
    {
      resDir: resDirSchema,
    },
    async ({ resDir }) => {
      const dir = getResDir(resDir);
      const err = validateResDir(dir);
      if (err) return { content: [{ type: "text" as const, text: `Error: ${err}` }] };

      const locales = discoverLocales(dir);
      // Build map: key -> locale -> placeholders
      const keyPlaceholders = new Map<string, Map<string, string[]>>();

      for (const l of locales) {
        const entries = parseStringsXml(l.filePath);
        for (const entry of entries) {
          const ph = extractPlaceholders(entry.value);
          if (ph.length === 0) continue;
          if (!keyPlaceholders.has(entry.name)) keyPlaceholders.set(entry.name, new Map());
          keyPlaceholders.get(entry.name)!.set(l.locale, ph);
        }
      }

      const issues: string[] = [];
      for (const [key, localeMap] of keyPlaceholders) {
        const entries = [...localeMap.entries()];
        if (entries.length <= 1) continue;

        const [refLocale, refPh] = entries[0];
        const refStr = refPh.join(",");

        for (let i = 1; i < entries.length; i++) {
          const [locale, ph] = entries[i];
          if (ph.join(",") !== refStr) {
            issues.push(`  "${key}": ${refLocale}=[${refPh.join(", ")}] vs ${locale}=[${ph.join(", ")}]`);
          }
        }
      }

      if (issues.length === 0) {
        return { content: [{ type: "text" as const, text: "All format string placeholders are consistent across locales." }] };
      }

      return {
        content: [{
          type: "text" as const,
          text: `Found ${issues.length} placeholder mismatch(es) (may cause runtime crashes!):\n${issues.join("\n")}`,
        }],
      };
    }
  );
}
