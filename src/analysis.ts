import * as fs from "fs";
import * as path from "path";
import { discoverLocales } from "./locales.js";
import { parseStringsXml, extractPlaceholders } from "./xml.js";

// --- Unused key detection ---

function collectSourceReferences(srcDirs: string[]): Set<string> {
  const refs = new Set<string>();
  const rStringRegex = /R\.string\.(\w+)/g;
  const atStringRegex = /@string\/(\w+)/g;

  function scan(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(full);
      } else {
        const content = fs.readFileSync(full, "utf-8");
        let match;
        while ((match = rStringRegex.exec(content)) !== null) refs.add(match[1]);
        while ((match = atStringRegex.exec(content)) !== null) refs.add(match[1]);
      }
    }
  }

  for (const dir of srcDirs) {
    if (fs.existsSync(dir)) scan(dir);
  }
  return refs;
}

export function findUnusedKeys(resDir: string, srcDirs: string[]): string[] {
  const locales = discoverLocales(resDir);
  const defaultLocale = locales.find((l) => l.locale === "default");
  if (!defaultLocale) return [];

  const entries = parseStringsXml(defaultLocale.filePath);
  const translatableKeys = entries.filter((e) => e.translatable).map((e) => e.name);
  const refs = collectSourceReferences(srcDirs);

  return translatableKeys.filter((key) => !refs.has(key));
}

// --- Translation stats ---

export interface LocaleStat {
  locale: string;
  present: number;
  missing: number;
  percent: number;
  missingKeys: string[];
}

export interface TranslationStats {
  totalTranslatable: number;
  locales: LocaleStat[];
}

export function getTranslationStats(resDir: string): TranslationStats {
  const locales = discoverLocales(resDir);
  const defaultLocale = locales.find((l) => l.locale === "default");
  if (!defaultLocale) return { totalTranslatable: 0, locales: [] };

  const defaultEntries = parseStringsXml(defaultLocale.filePath);
  const translatableKeys = defaultEntries.filter((e) => e.translatable).map((e) => e.name);
  const totalTranslatable = translatableKeys.length;

  const nonDefault = locales.filter((l) => l.locale !== "default");
  const stats: LocaleStat[] = nonDefault.map((l) => {
    const entries = parseStringsXml(l.filePath);
    const presentKeys = new Set(entries.map((e) => e.name));
    const missingKeys = translatableKeys.filter((k) => !presentKeys.has(k));
    const present = totalTranslatable - missingKeys.length;
    const percent = totalTranslatable === 0 ? 100 : Math.round((present / totalTranslatable) * 100);
    return { locale: l.locale, present, missing: missingKeys.length, percent, missingKeys };
  });

  return { totalTranslatable, locales: stats };
}

// --- Lint (combined report) ---

export interface LintReport {
  missing: { locale: string; key: string }[];
  placeholderMismatches: { key: string; details: string }[];
  duplicates: { value: string; keys: string[] }[];
  unused: string[];
}

export function lintStrings(resDir: string, srcDirs: string[]): LintReport {
  const locales = discoverLocales(resDir);
  const defaultLocale = locales.find((l) => l.locale === "default");
  if (!defaultLocale) return { missing: [], placeholderMismatches: [], duplicates: [], unused: [] };

  const defaultEntries = parseStringsXml(defaultLocale.filePath);
  const translatableKeys = defaultEntries.filter((e) => e.translatable).map((e) => e.name);

  // Missing translations
  const missing: { locale: string; key: string }[] = [];
  const nonDefault = locales.filter((l) => l.locale !== "default");
  for (const l of nonDefault) {
    const entries = parseStringsXml(l.filePath);
    const presentKeys = new Set(entries.map((e) => e.name));
    for (const key of translatableKeys) {
      if (!presentKeys.has(key)) missing.push({ locale: l.locale, key });
    }
  }

  // Placeholder mismatches
  const keyPlaceholders = new Map<string, Map<string, string[]>>();
  for (const l of locales) {
    const entries = parseStringsXml(l.filePath);
    for (const entry of entries) {
      const ph = extractPlaceholders(entry.value);
      if (ph.length === 0) continue;
      if (!keyPlaceholders.has(entry.name)) keyPlaceholders.set(entry.name, new Map());
      keyPlaceholders.get(entry.name)!.set(l.locale, ph);
    }
  }

  const placeholderMismatches: { key: string; details: string }[] = [];
  for (const [key, localeMap] of keyPlaceholders) {
    const entries = [...localeMap.entries()];
    if (entries.length <= 1) continue;
    const [refLocale, refPh] = entries[0];
    const refStr = refPh.join(",");
    for (let i = 1; i < entries.length; i++) {
      const [locale, ph] = entries[i];
      if (ph.join(",") !== refStr) {
        placeholderMismatches.push({
          key,
          details: `${refLocale}=[${refPh.join(", ")}] vs ${locale}=[${ph.join(", ")}]`,
        });
      }
    }
  }

  // Duplicates (in default locale)
  const valueMap = new Map<string, string[]>();
  for (const entry of defaultEntries) {
    if (!entry.translatable) continue;
    const normalized = entry.value.trim();
    if (!valueMap.has(normalized)) valueMap.set(normalized, []);
    valueMap.get(normalized)!.push(entry.name);
  }
  const duplicates: { value: string; keys: string[] }[] = [];
  for (const [value, keys] of valueMap) {
    if (keys.length > 1) duplicates.push({ value, keys });
  }

  // Unused keys
  const unused = findUnusedKeys(resDir, srcDirs);

  return { missing, placeholderMismatches, duplicates, unused };
}
