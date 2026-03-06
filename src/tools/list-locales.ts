import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverLocales, getResDirs, validateResDirs } from "../locales.js";
import { parseStringsXml, parsePluralsXml, parseStringArraysXml } from "../xml.js";

const resDirSchema = z.string().optional().describe("Path to the Android res/ directory. Defaults to ANDROID_RES_DIR env var.");

export function registerListLocales(server: McpServer): void {
  server.tool(
    "list_locales",
    "Show all detected locales with string counts, plural counts, and string-array counts",
    {
      resDir: resDirSchema,
    },
    async ({ resDir }) => {
      const dirs = getResDirs(resDir);
      const err = validateResDirs(dirs);
      if (err) return { content: [{ type: "text" as const, text: `Error: ${err}` }] };

      const locales = discoverLocales(dirs);
      const lines: string[] = [`Detected ${locales.length} locale(s):\n`];

      for (const l of locales) {
        const strings = parseStringsXml(l.filePath);
        const plurals = parsePluralsXml(l.filePath);
        const arrays = parseStringArraysXml(l.filePath);
        const translatable = strings.filter((s) => s.translatable).length;
        lines.push(`  ${l.locale}: ${strings.length} strings (${translatable} translatable), ${plurals.length} plurals, ${arrays.length} string-arrays`);
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );
}
