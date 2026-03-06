import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverLocales, getResDirs, validateResDirs } from "../locales.js";
import { parseStringsXml } from "../xml.js";

const resDirSchema = z.string().optional().describe("Path to the Android res/ directory. Defaults to ANDROID_RES_DIR env var.");

export function registerGetString(server: McpServer): void {
  server.tool(
    "get_string",
    "Look up a string key and show its value across all detected locales",
    {
      key: z.string().describe("The string resource name to look up"),
      resDir: resDirSchema,
    },
    async ({ key, resDir }) => {
      const dirs = getResDirs(resDir);
      const err = validateResDirs(dirs);
      if (err) return { content: [{ type: "text" as const, text: `Error: ${err}` }] };

      const locales = discoverLocales(dirs);
      const results: string[] = [];

      for (const l of locales) {
        const entries = parseStringsXml(l.filePath);
        const entry = entries.find((e) => e.name === key);
        results.push(entry ? `  ${l.locale}: ${entry.value}` : `  ${l.locale}: (missing)`);
      }

      return { content: [{ type: "text" as const, text: `"${key}":\n${results.join("\n")}` }] };
    }
  );
}
