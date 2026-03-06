import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getResDirs, validateResDirs } from "../locales.js";
import { findUnusedKeys, getTranslationStats, lintStrings } from "../analysis.js";

const resDirSchema = z.string().optional().describe("Path to the Android res/ directory. Defaults to ANDROID_RES_DIR env var.");
const srcDirsSchema = z.array(z.string()).describe("Paths to source directories to scan for string references (R.string.X, @string/X).");

export function registerFindUnusedKeys(server: McpServer): void {
  server.tool(
    "find_unused_keys",
    "Find string keys defined in strings.xml but never referenced in source code (R.string.X or @string/X). Helps remove dead strings.",
    {
      srcDirs: srcDirsSchema,
      resDir: resDirSchema,
    },
    async ({ srcDirs, resDir }) => {
      const dirs = getResDirs(resDir);
      const err = validateResDirs(dirs);
      if (err) return { content: [{ type: "text" as const, text: `Error: ${err}` }] };

      const unused = findUnusedKeys(dirs[0], srcDirs);

      if (unused.length === 0) {
        return { content: [{ type: "text" as const, text: "All string keys are referenced in source code." }] };
      }

      return {
        content: [{
          type: "text" as const,
          text: `Found ${unused.length} unused key(s):\n${unused.map((k) => `  - ${k}`).join("\n")}`,
        }],
      };
    }
  );
}

export function registerTranslationStats(server: McpServer): void {
  server.tool(
    "translation_stats",
    "Show translation completion stats per locale — how many keys are translated, missing count, and percentage.",
    {
      resDir: resDirSchema,
    },
    async ({ resDir }) => {
      const dirs = getResDirs(resDir);
      const err = validateResDirs(dirs);
      if (err) return { content: [{ type: "text" as const, text: `Error: ${err}` }] };

      const stats = getTranslationStats(dirs[0]);

      if (stats.locales.length === 0) {
        return { content: [{ type: "text" as const, text: `Total translatable keys: ${stats.totalTranslatable}\nNo non-default locales found.` }] };
      }

      const lines = stats.locales.map((l) => {
        const bar = `${l.percent}%`;
        const detail = l.missing > 0 ? ` (missing: ${l.missingKeys.join(", ")})` : "";
        return `  ${l.locale}: ${l.present}/${stats.totalTranslatable} ${bar}${detail}`;
      });

      return {
        content: [{
          type: "text" as const,
          text: `Translation stats (${stats.totalTranslatable} translatable keys):\n${lines.join("\n")}`,
        }],
      };
    }
  );
}

export function registerLintStrings(server: McpServer): void {
  server.tool(
    "lint_strings",
    "Run all string quality checks at once: missing translations, placeholder mismatches, duplicate values, and unused keys.",
    {
      srcDirs: srcDirsSchema,
      resDir: resDirSchema,
    },
    async ({ srcDirs, resDir }) => {
      const dirs = getResDirs(resDir);
      const err = validateResDirs(dirs);
      if (err) return { content: [{ type: "text" as const, text: `Error: ${err}` }] };

      const report = lintStrings(dirs[0], srcDirs);

      const sections: string[] = [];

      if (report.missing.length > 0) {
        sections.push(`Missing translations (${report.missing.length}):\n${report.missing.map((m) => `  ${m.locale}: ${m.key}`).join("\n")}`);
      }

      if (report.placeholderMismatches.length > 0) {
        sections.push(`Placeholder mismatches (${report.placeholderMismatches.length}):\n${report.placeholderMismatches.map((m) => `  ${m.key}: ${m.details}`).join("\n")}`);
      }

      if (report.duplicates.length > 0) {
        sections.push(`Duplicate values (${report.duplicates.length}):\n${report.duplicates.map((d) => `  "${d.value}" → ${d.keys.join(", ")}`).join("\n")}`);
      }

      if (report.unused.length > 0) {
        sections.push(`Unused keys (${report.unused.length}):\n${report.unused.map((k) => `  - ${k}`).join("\n")}`);
      }

      if (sections.length === 0) {
        return { content: [{ type: "text" as const, text: "All checks passed — no issues found." }] };
      }

      return {
        content: [{
          type: "text" as const,
          text: sections.join("\n\n"),
        }],
      };
    }
  );
}
