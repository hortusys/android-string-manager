import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverLocales, getResDir, validateResDir } from "../locales.js";
import { deleteStringFromXml } from "../xml.js";

const resDirSchema = z.string().optional().describe("Path to the Android res/ directory. Defaults to ANDROID_RES_DIR env var.");

export function registerDeleteString(server: McpServer): void {
  server.tool(
    "delete_string",
    "Remove a string key from all locale files",
    {
      key: z.string().describe("The string resource name to delete"),
      resDir: resDirSchema,
    },
    async ({ key, resDir }) => {
      const dir = getResDir(resDir);
      const err = validateResDir(dir);
      if (err) return { content: [{ type: "text" as const, text: `Error: ${err}` }] };

      const locales = discoverLocales(dir);
      const deleted: string[] = [];
      const notFound: string[] = [];

      for (const l of locales) {
        const success = deleteStringFromXml(l.filePath, key);
        if (success) { deleted.push(l.locale); }
        else { notFound.push(l.locale); }
      }

      const parts: string[] = [];
      if (deleted.length > 0) parts.push(`Deleted "${key}" from: ${deleted.join(", ")}`);
      if (notFound.length > 0) parts.push(`Not found in: ${notFound.join(", ")}`);

      return { content: [{ type: "text" as const, text: parts.join("\n") }] };
    }
  );
}
