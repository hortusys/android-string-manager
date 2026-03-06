import * as fs from "fs";
import * as path from "path";

export interface LocaleConfig {
  locale: string;
  filePath: string;
}

export function discoverLocales(resDir: string | string[]): LocaleConfig[] {
  if (Array.isArray(resDir)) {
    const seen = new Set<string>();
    const merged: LocaleConfig[] = [];
    for (const dir of resDir) {
      for (const lc of discoverLocales(dir)) {
        if (!seen.has(lc.locale)) {
          seen.add(lc.locale);
          merged.push(lc);
        }
      }
    }
    return merged;
  }

  const locales: LocaleConfig[] = [];
  const defaultLocaleName = process.env.ANDROID_DEFAULT_LOCALE;

  if (defaultLocaleName) {
    const customDefault = path.join(resDir, `values-${defaultLocaleName}`, "strings.xml");
    if (fs.existsSync(customDefault)) {
      locales.push({ locale: "default", filePath: customDefault });
    }
  } else {
    const defaultFile = path.join(resDir, "values", "strings.xml");
    if (fs.existsSync(defaultFile)) {
      locales.push({ locale: "default", filePath: defaultFile });
    }
  }

  const entries = fs.readdirSync(resDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/^values-([a-z]{2,3}(?:-r[A-Z]{2})?)$/);
    if (!match) continue;
    if (defaultLocaleName && match[1] === defaultLocaleName) continue;
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

export function getResDirs(resDir?: string): string[] {
  const raw = resDir || process.env.ANDROID_RES_DIR || "";
  if (!raw) return [];
  return raw.split(",").map((d) => d.trim()).filter(Boolean);
}

export function validateResDirs(resDirs: string[]): string | null {
  if (resDirs.length === 0) return "No res directory specified. Set ANDROID_RES_DIR env var or pass resDir.";
  for (const dir of resDirs) {
    if (!fs.existsSync(dir)) return `Resource directory not found: ${dir}`;
  }
  const locales = discoverLocales(resDirs);
  if (locales.length === 0) return `No strings.xml files found in: ${resDirs.join(", ")}`;
  return null;
}
