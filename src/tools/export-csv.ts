import { z } from "zod";
import * as fs from "fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverLocales, getResDirs, validateResDirs } from "../locales.js";
import { parseStringsXml } from "../xml.js";

const resDirSchema = z.string().optional().describe("Path to the Android res/ directory. Defaults to ANDROID_RES_DIR env var.");

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function registerExportCsv(server: McpServer): void {
  server.tool(
    "export_csv",
    "Export all translatable strings to CSV format for sending to translators. Columns: key, locale1, locale2, ...",
    {
      outputPath: z.string().optional().describe("File path to write CSV. If omitted, returns CSV content as text."),
      resDir: resDirSchema,
    },
    async ({ outputPath, resDir }) => {
      const dirs = getResDirs(resDir);
      const err = validateResDirs(dirs);
      if (err) return { content: [{ type: "text" as const, text: `Error: ${err}` }] };

      const locales = discoverLocales(dirs);
      const allEntries = new Map<string, Map<string, string>>();

      for (const l of locales) {
        const entries = parseStringsXml(l.filePath);
        for (const entry of entries) {
          if (!entry.translatable) continue;
          if (!allEntries.has(entry.name)) allEntries.set(entry.name, new Map());
          allEntries.get(entry.name)!.set(l.locale, entry.value);
        }
      }

      const localeNames = locales.map((l) => l.locale);
      const header = ["key", ...localeNames].join(",");
      const rows: string[] = [header];

      for (const [key, localeValues] of allEntries) {
        const values = localeNames.map((ln) => csvEscape(localeValues.get(ln) ?? ""));
        rows.push([csvEscape(key), ...values].join(","));
      }

      const csv = rows.join("\n") + "\n";

      if (outputPath) {
        fs.writeFileSync(outputPath, csv, "utf-8");
        return { content: [{ type: "text" as const, text: `Exported ${allEntries.size} strings to ${outputPath}` }] };
      }

      return { content: [{ type: "text" as const, text: csv }] };
    }
  );
}

export function registerImportCsv(server: McpServer): void {
  server.tool(
    "import_csv",
    "Import translations from a CSV file. CSV must have 'key' as first column, locale codes as other columns. Updates existing keys, adds new ones.",
    {
      inputPath: z.string().describe("Path to the CSV file to import"),
      dryRun: z.boolean().optional().describe("Preview changes without writing. Default: false"),
      resDir: resDirSchema,
    },
    async ({ inputPath, dryRun, resDir }) => {
      const dirs = getResDirs(resDir);
      const err = validateResDirs(dirs);
      if (err) return { content: [{ type: "text" as const, text: `Error: ${err}` }] };

      if (!fs.existsSync(inputPath)) {
        return { content: [{ type: "text" as const, text: `Error: File not found: ${inputPath}` }] };
      }

      const locales = discoverLocales(dirs);
      const csv = fs.readFileSync(inputPath, "utf-8");
      const lines = csv.trim().split("\n");
      if (lines.length < 2) {
        return { content: [{ type: "text" as const, text: "Error: CSV must have a header row and at least one data row." }] };
      }

      const headers = parseCsvLine(lines[0]);
      if (headers[0] !== "key") {
        return { content: [{ type: "text" as const, text: 'Error: First column must be "key".' }] };
      }

      const localeColumns = headers.slice(1);
      let added = 0;
      let updated = 0;
      let skipped = 0;
      const details: string[] = [];

      // Import uses the xml functions but inlined to support dry-run
      const { parseStringsXml, insertStringInXml, updateStringInXml } = await import("../xml.js");

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const key = cols[0];
        if (!key) continue;

        for (let j = 0; j < localeColumns.length; j++) {
          const localeCode = localeColumns[j];
          const value = cols[j + 1];
          if (!value) continue;

          const l = locales.find((lc) => lc.locale === localeCode);
          if (!l) { skipped++; continue; }

          const existing = parseStringsXml(l.filePath).find((e) => e.name === key);

          if (dryRun) {
            if (existing) {
              if (existing.value !== value) {
                details.push(`  UPDATE ${localeCode}/${key}: "${existing.value}" → "${value}"`);
                updated++;
              }
            } else {
              details.push(`  ADD ${localeCode}/${key}: "${value}"`);
              added++;
            }
          } else {
            if (existing) {
              if (existing.value !== value) {
                updateStringInXml(l.filePath, key, value);
                updated++;
              }
            } else {
              insertStringInXml(l.filePath, key, value);
              added++;
            }
          }
        }
      }

      const mode = dryRun ? "[DRY RUN] " : "";
      const summary = `${mode}Import complete: ${added} added, ${updated} updated, ${skipped} skipped`;
      const text = details.length > 0 ? `${summary}\n${details.join("\n")}` : summary;

      return { content: [{ type: "text" as const, text }] };
    }
  );
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}
