import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverLocales, getResDir, validateResDir } from "../locales.js";
import { parseStringArraysXml, insertStringArrayInXml, updateStringArrayInXml, deleteStringArrayFromXml } from "../xml.js";
import { withBackup } from "../backup.js";

const resDirSchema = z.string().optional().describe("Path to the Android res/ directory. Defaults to ANDROID_RES_DIR env var.");

export function registerAddStringArray(server: McpServer): void {
  server.tool(
    "add_string_array",
    "Add a new <string-array> resource to locale files.",
    {
      key: z.string().describe("The string-array resource name"),
      locales: z.record(z.string(), z.array(z.string())).describe('Map of locale code to array of string items'),
      resDir: resDirSchema,
    },
    async ({ key, locales: localeValues, resDir }) => {
      const dir = getResDir(resDir);
      const err = validateResDir(dir);
      if (err) return { content: [{ type: "text" as const, text: `Error: ${err}` }] };

      const locales = discoverLocales(dir);
      const targetLocales = locales.filter((l) => l.locale in localeValues);

      if (targetLocales.length === 0) {
        const available = locales.map((l) => l.locale).join(", ");
        return { content: [{ type: "text" as const, text: `Error: No matching locales. Available: ${available}` }] };
      }

      for (const l of targetLocales) {
        const existing = parseStringArraysXml(l.filePath);
        if (existing.some((e) => e.name === key)) {
          return { content: [{ type: "text" as const, text: `Error: String-array "${key}" already exists in ${l.locale}. Use update_string_array instead.` }] };
        }
      }

      try {
        for (const l of targetLocales) {
          withBackup(l.filePath, () => {
            insertStringArrayInXml(l.filePath, key, localeValues[l.locale]);
          });
        }
      } catch (e) {
        return { content: [{ type: "text" as const, text: `Error: Write failed and was rolled back: ${e}` }] };
      }

      return { content: [{ type: "text" as const, text: `Added string-array "${key}" to ${targetLocales.length} locale(s).` }] };
    }
  );
}

export function registerUpdateStringArray(server: McpServer): void {
  server.tool(
    "update_string_array",
    "Update a <string-array> resource in one or more locales.",
    {
      key: z.string().describe("The string-array resource name to update"),
      locales: z.record(z.string(), z.array(z.string())).describe('Map of locale code to new array of string items'),
      resDir: resDirSchema,
    },
    async ({ key, locales: localeValues, resDir }) => {
      const dir = getResDir(resDir);
      const err = validateResDir(dir);
      if (err) return { content: [{ type: "text" as const, text: `Error: ${err}` }] };

      const locales = discoverLocales(dir);
      const updated: string[] = [];
      const notFound: string[] = [];

      for (const [locale, items] of Object.entries(localeValues)) {
        const l = locales.find((lc) => lc.locale === locale);
        if (!l) continue;
        const success = withBackup(l.filePath, () => updateStringArrayInXml(l.filePath, key, items));
        if (success) { updated.push(locale); }
        else { notFound.push(locale); }
      }

      const parts: string[] = [];
      if (updated.length > 0) parts.push(`Updated string-array "${key}" in: ${updated.join(", ")}`);
      if (notFound.length > 0) parts.push(`Not found in: ${notFound.join(", ")}`);

      return { content: [{ type: "text" as const, text: parts.join("\n") }] };
    }
  );
}

export function registerDeleteStringArray(server: McpServer): void {
  server.tool(
    "delete_string_array",
    "Remove a <string-array> resource from all locale files",
    {
      key: z.string().describe("The string-array resource name to delete"),
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
        const success = withBackup(l.filePath, () => deleteStringArrayFromXml(l.filePath, key));
        if (success) { deleted.push(l.locale); }
        else { notFound.push(l.locale); }
      }

      const parts: string[] = [];
      if (deleted.length > 0) parts.push(`Deleted string-array "${key}" from: ${deleted.join(", ")}`);
      if (notFound.length > 0) parts.push(`Not found in: ${notFound.join(", ")}`);

      return { content: [{ type: "text" as const, text: parts.join("\n") }] };
    }
  );
}
