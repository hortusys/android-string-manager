import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverLocales, getResDir, validateResDir } from "../locales.js";
import { parseStringsXml } from "../xml.js";

const execFileAsync = promisify(execFile);
const resDirSchema = z.string().optional().describe("Path to the Android res/ directory. Defaults to ANDROID_RES_DIR env var.");

export function registerGitDiff(server: McpServer): void {
  server.tool(
    "diff_strings",
    "Show which strings changed since last git commit (added, modified, deleted keys). Requires git.",
    {
      ref: z.string().optional().describe("Git ref to compare against. Default: HEAD"),
      resDir: resDirSchema,
    },
    async ({ ref, resDir }) => {
      const dir = getResDir(resDir);
      const err = validateResDir(dir);
      if (err) return { content: [{ type: "text" as const, text: `Error: ${err}` }] };

      const gitRef = ref ?? "HEAD";
      const locales = discoverLocales(dir);
      const changes: string[] = [];

      for (const l of locales) {
        const currentEntries = parseStringsXml(l.filePath);
        const currentMap = new Map(currentEntries.map((e) => [e.name, e.value]));

        let oldContent: string;
        try {
          // execFile is used (not exec) — no shell injection risk
          const { stdout } = await execFileAsync("git", ["show", `${gitRef}:${l.filePath}`], {
            cwd: process.cwd(),
          });
          oldContent = stdout;
        } catch {
          changes.push(`  ${l.locale}: (new file)`);
          continue;
        }

        const oldEntries = new Map<string, string>();
        const regex = /<string\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g;
        let match;
        while ((match = regex.exec(oldContent)) !== null) {
          oldEntries.set(match[1], match[2]);
        }

        const added: string[] = [];
        const modified: string[] = [];
        const deleted: string[] = [];

        for (const [key, value] of currentMap) {
          if (!oldEntries.has(key)) {
            added.push(key);
          } else if (oldEntries.get(key) !== value) {
            modified.push(key);
          }
        }

        for (const key of oldEntries.keys()) {
          if (!currentMap.has(key)) {
            deleted.push(key);
          }
        }

        if (added.length === 0 && modified.length === 0 && deleted.length === 0) continue;

        changes.push(`  ${l.locale}:`);
        if (added.length > 0) changes.push(`    added: ${added.join(", ")}`);
        if (modified.length > 0) changes.push(`    modified: ${modified.join(", ")}`);
        if (deleted.length > 0) changes.push(`    deleted: ${deleted.join(", ")}`);
      }

      if (changes.length === 0) {
        return { content: [{ type: "text" as const, text: `No string changes since ${gitRef}.` }] };
      }

      return { content: [{ type: "text" as const, text: `String changes since ${gitRef}:\n${changes.join("\n")}` }] };
    }
  );
}
