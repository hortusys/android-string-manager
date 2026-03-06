import * as fs from "fs";
import * as path from "path";

export interface LocaleConfig {
  locale: string;
  filePath: string;
}

export function discoverLocales(resDir: string): LocaleConfig[] {
  const locales: LocaleConfig[] = [];

  const defaultFile = path.join(resDir, "values", "strings.xml");
  if (fs.existsSync(defaultFile)) {
    locales.push({ locale: "default", filePath: defaultFile });
  }

  const entries = fs.readdirSync(resDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/^values-([a-z]{2,3}(?:-r[A-Z]{2})?)$/);
    if (!match) continue;
    const stringsFile = path.join(resDir, entry.name, "strings.xml");
    if (fs.existsSync(stringsFile)) {
      locales.push({ locale: match[1], filePath: stringsFile });
    }
  }

  return locales;
}

export function validateResDir(resDir: string): string | null {
  if (!resDir) return "No res directory specified. Set ANDROID_RES_DIR env var or pass resDir.";
  if (!fs.existsSync(resDir)) return `Resource directory not found: ${resDir}`;
  const locales = discoverLocales(resDir);
  if (locales.length === 0) return `No strings.xml files found in: ${resDir}`;
  return null;
}

const DEFAULT_RES_DIR = process.env.ANDROID_RES_DIR || "";

export function getResDir(resDir?: string): string {
  return resDir || DEFAULT_RES_DIR;
}
