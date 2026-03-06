import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverLocales, getResDir, validateResDir } from "../locales.js";
import { sortStringsInXml } from "../xml.js";

const resDirSchema = z.string().optional().describe("Path to the Android res/ directory. Defaults to ANDROID_RES_DIR env var.");

export function registerSortStrings(server: McpServer): void {
  server.tool(
    "sort_strings",
    "Alphabetically sort string keys in locale files. Reduces merge conflicts. Applies to all locales or a specific one.",
    {
      locale: z.string().optional().describe("Sort only this locale. Omit to sort all."),
      resDir: resDirSchema,
    },
    async ({ locale, resDir }) => {
      const dir = getResDir(resDir);
      const err = validateResDir(dir);
      if (err) return { content: [{ type: "text" as const, text: `Error: ${err}` }] };

      const locales = discoverLocales(dir);
      const targets = locale ? locales.filter((l) => l.locale === locale) : locales;

      if (targets.length === 0) {
        return { content: [{ type: "text" as const, text: `Error: Locale "${locale}" not found.` }] };
      }

      const results: string[] = [];
      for (const l of targets) {
        const moved = sortStringsInXml(l.filePath);
        results.push(moved > 0 ? `  ${l.locale}: ${moved} strings reordered` : `  ${l.locale}: already sorted`);
      }

      return { content: [{ type: "text" as const, text: `Sort results:\n${results.join("\n")}` }] };
    }
  );
}
