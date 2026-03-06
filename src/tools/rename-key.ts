import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverLocales, getResDir, validateResDir } from "../locales.js";
import { renameStringInXml } from "../xml.js";

const resDirSchema = z.string().optional().describe("Path to the Android res/ directory. Defaults to ANDROID_RES_DIR env var.");

export function registerRenameKey(server: McpServer): void {
  server.tool(
    "rename_key",
    "Rename a string key across all locale files atomically. Preserves ordering and values.",
    {
      oldKey: z.string().describe("Current string resource name"),
      newKey: z.string().describe("New string resource name"),
      resDir: resDirSchema,
    },
    async ({ oldKey, newKey, resDir }) => {
      const dir = getResDir(resDir);
      const err = validateResDir(dir);
      if (err) return { content: [{ type: "text" as const, text: `Error: ${err}` }] };

      const locales = discoverLocales(dir);
      const renamed: string[] = [];
      const notFound: string[] = [];

      for (const l of locales) {
        const success = renameStringInXml(l.filePath, oldKey, newKey);
        if (success) { renamed.push(l.locale); }
        else { notFound.push(l.locale); }
      }

      const parts: string[] = [];
      if (renamed.length > 0) parts.push(`Renamed "${oldKey}" → "${newKey}" in: ${renamed.join(", ")}`);
      if (notFound.length > 0) parts.push(`Not found in: ${notFound.join(", ")}`);

      return { content: [{ type: "text" as const, text: parts.join("\n") }] };
    }
  );
}
