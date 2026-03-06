import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverLocales, getResDir, validateResDir } from "../locales.js";
import { parseStringsXml } from "../xml.js";

const resDirSchema = z.string().optional().describe("Path to the Android res/ directory. Defaults to ANDROID_RES_DIR env var.");

export function registerListMissing(server: McpServer): void {
  server.tool(
    "list_missing",
    "Find string keys that exist in one locale but are missing in others. Auto-detects all locales.",
    {
      resDir: resDirSchema,
    },
    async ({ resDir }) => {
      const dir = getResDir(resDir);
      const err = validateResDir(dir);
      if (err) return { content: [{ type: "text" as const, text: `Error: ${err}` }] };

      const locales = discoverLocales(dir);
      const localeMaps = new Map<string, Set<string>>();

      for (const l of locales) {
        const entries = parseStringsXml(l.filePath);
        const keys = new Set(entries.filter((e) => e.translatable).map((e) => e.name));
        localeMaps.set(l.locale, keys);
      }

      const allKeys = new Set<string>();
      for (const keys of localeMaps.values()) {
        for (const k of keys) allKeys.add(k);
      }

      const missing: string[] = [];
      for (const key of allKeys) {
        const missingIn: string[] = [];
        for (const [locale, keys] of localeMaps) {
          if (!keys.has(key)) missingIn.push(locale);
        }
        if (missingIn.length > 0) {
          missing.push(`  "${key}" missing in: ${missingIn.join(", ")}`);
        }
      }

      const localeList = locales.map((l) => l.locale).join(", ");

      if (missing.length === 0) {
        return { content: [{ type: "text" as const, text: `All translatable strings are present in all locales (${localeList}).` }] };
      }

      return {
        content: [{
          type: "text" as const,
          text: `Detected locales: ${localeList}\nFound ${missing.length} missing translation(s):\n${missing.join("\n")}`,
        }],
      };
    }
  );
}
