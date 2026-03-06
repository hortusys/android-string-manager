import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverLocales, getResDir, validateResDir } from "../locales.js";
import { parseStringsXml, insertStringInXml } from "../xml.js";

const resDirSchema = z.string().optional().describe("Path to the Android res/ directory. Defaults to ANDROID_RES_DIR env var.");

export function registerAddString(server: McpServer): void {
  server.tool(
    "add_string",
    "Add a new string resource to locale files. Provide values as a JSON object mapping locale codes to strings.",
    {
      key: z.string().describe("The string resource name (e.g. 'btn_save')"),
      values: z.record(z.string(), z.string()).describe('Map of locale code to value. Use "default" for values/strings.xml.'),
      afterKey: z.string().optional().describe("Insert after this key instead of at the end. Helps keep related strings grouped."),
      resDir: resDirSchema,
    },
    async ({ key, values, afterKey, resDir }) => {
      const dir = getResDir(resDir);
      const err = validateResDir(dir);
      if (err) return { content: [{ type: "text" as const, text: `Error: ${err}` }] };

      const locales = discoverLocales(dir);
      const targetLocales = locales.filter((l) => l.locale in values);

      if (targetLocales.length === 0) {
        const available = locales.map((l) => l.locale).join(", ");
        return { content: [{ type: "text" as const, text: `Error: None of the provided locales match. Available: ${available}` }] };
      }

      for (const l of targetLocales) {
        const entries = parseStringsXml(l.filePath);
        if (entries.some((e) => e.name === key)) {
          return { content: [{ type: "text" as const, text: `Error: Key "${key}" already exists in ${l.locale}. Use update_string instead.` }] };
        }
      }

      for (const l of targetLocales) {
        insertStringInXml(l.filePath, key, values[l.locale], afterKey);
      }

      const summary = targetLocales.map((l) => `  ${l.locale}: ${values[l.locale]}`).join("\n");
      return { content: [{ type: "text" as const, text: `Added "${key}" to ${targetLocales.length} locale(s):\n${summary}` }] };
    }
  );
}

export function registerAddStrings(server: McpServer): void {
  server.tool(
    "add_strings",
    "Add multiple string resources at once. Each entry maps a key to its locale values.",
    {
      strings: z.array(z.object({
        key: z.string().describe("The string resource name"),
        values: z.record(z.string(), z.string()).describe("Map of locale code to value"),
      })).describe("Array of {key, values} objects to add"),
      resDir: resDirSchema,
    },
    async ({ strings, resDir }) => {
      const dir = getResDir(resDir);
      const err = validateResDir(dir);
      if (err) return { content: [{ type: "text" as const, text: `Error: ${err}` }] };

      const locales = discoverLocales(dir);
      const results: string[] = [];
      let added = 0;

      for (const { key, values } of strings) {
        const targetLocales = locales.filter((l) => l.locale in values);
        let skip = false;

        for (const l of targetLocales) {
          const entries = parseStringsXml(l.filePath);
          if (entries.some((e) => e.name === key)) {
            results.push(`  "${key}": skipped (already exists in ${l.locale})`);
            skip = true;
            break;
          }
        }

        if (skip) continue;

        for (const l of targetLocales) {
          insertStringInXml(l.filePath, key, values[l.locale]);
        }
        results.push(`  "${key}": added to ${targetLocales.length} locale(s)`);
        added++;
      }

      return { content: [{ type: "text" as const, text: `Added ${added}/${strings.length} string(s):\n${results.join("\n")}` }] };
    }
  );
}
