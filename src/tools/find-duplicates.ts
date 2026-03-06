import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverLocales, getResDirs, validateResDirs } from "../locales.js";
import { parseStringsXml } from "../xml.js";

const resDirSchema = z.string().optional().describe("Path to the Android res/ directory. Defaults to ANDROID_RES_DIR env var.");

export function registerFindDuplicates(server: McpServer): void {
  server.tool(
    "find_duplicates",
    "Find different keys that have identical values in the same locale. Likely copy-paste errors or consolidation opportunities.",
    {
      locale: z.string().optional().describe('Which locale to check. Default: "default"'),
      resDir: resDirSchema,
    },
    async ({ locale, resDir }) => {
      const dirs = getResDirs(resDir);
      const err = validateResDirs(dirs);
      if (err) return { content: [{ type: "text" as const, text: `Error: ${err}` }] };

      const locales = discoverLocales(dirs);
      const targetLocale = locale ?? "default";
      const l = locales.find((lc) => lc.locale === targetLocale);
      if (!l) {
        const available = locales.map((lc) => lc.locale).join(", ");
        return { content: [{ type: "text" as const, text: `Error: Locale "${targetLocale}" not found. Available: ${available}` }] };
      }

      const entries = parseStringsXml(l.filePath);
      const valueMap = new Map<string, string[]>();

      for (const entry of entries) {
        if (!entry.translatable) continue;
        const normalized = entry.value.trim();
        if (!valueMap.has(normalized)) valueMap.set(normalized, []);
        valueMap.get(normalized)!.push(entry.name);
      }

      const duplicates: string[] = [];
      for (const [value, keys] of valueMap) {
        if (keys.length > 1) {
          duplicates.push(`  "${value}" → ${keys.join(", ")}`);
        }
      }

      if (duplicates.length === 0) {
        return { content: [{ type: "text" as const, text: `No duplicate values found in ${targetLocale}.` }] };
      }

      return {
        content: [{
          type: "text" as const,
          text: `Found ${duplicates.length} duplicate value(s) in ${targetLocale}:\n${duplicates.join("\n")}`,
        }],
      };
    }
  );
}
