import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverLocales, getResDir, validateResDir } from "../locales.js";
import { updateStringInXml } from "../xml.js";

const resDirSchema = z.string().optional().describe("Path to the Android res/ directory. Defaults to ANDROID_RES_DIR env var.");

export function registerUpdateString(server: McpServer): void {
  server.tool(
    "update_string",
    "Update a string value in one or more locales. Provide values as a JSON object mapping locale codes to new strings.",
    {
      key: z.string().describe("The string resource name to update"),
      values: z.record(z.string(), z.string()).describe('Map of locale code to new value. Only specified locales are updated.'),
      resDir: resDirSchema,
    },
    async ({ key, values, resDir }) => {
      const dir = getResDir(resDir);
      const err = validateResDir(dir);
      if (err) return { content: [{ type: "text" as const, text: `Error: ${err}` }] };

      const locales = discoverLocales(dir);
      const updated: string[] = [];
      const notFound: string[] = [];
      const skipped: string[] = [];

      for (const [locale, val] of Object.entries(values)) {
        const l = locales.find((lc) => lc.locale === locale);
        if (!l) { skipped.push(locale); continue; }
        const success = updateStringInXml(l.filePath, key, val);
        if (success) { updated.push(`  ${locale}: ${val}`); }
        else { notFound.push(locale); }
      }

      const parts: string[] = [];
      if (updated.length > 0) parts.push(`Updated "${key}":\n${updated.join("\n")}`);
      if (notFound.length > 0) parts.push(`Key "${key}" not found in: ${notFound.join(", ")}`);
      if (skipped.length > 0) parts.push(`Unknown locales: ${skipped.join(", ")}`);
      if (parts.length === 0) parts.push("No values provided.");

      return { content: [{ type: "text" as const, text: parts.join("\n") }] };
    }
  );
}
