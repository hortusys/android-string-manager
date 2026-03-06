import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { discoverLocales, validateResDir } from "../locales.js";

let tmpDir: string;

function createLocale(resDir: string, folder: string): void {
  const dir = path.join(resDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "strings.xml"),
    '<?xml version="1.0"?>\n<resources>\n    <string name="test">Test</string>\n</resources>',
    "utf-8"
  );
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asm-locale-test-"));
});

afterEach(() => {
  delete process.env.ANDROID_DEFAULT_LOCALE;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("discoverLocales", () => {
  it("discovers default locale", () => {
    createLocale(tmpDir, "values");
    const locales = discoverLocales(tmpDir);
    expect(locales).toHaveLength(1);
    expect(locales[0].locale).toBe("default");
  });

  it("discovers language locales", () => {
    createLocale(tmpDir, "values");
    createLocale(tmpDir, "values-ru");
    createLocale(tmpDir, "values-uk");
    const locales = discoverLocales(tmpDir);
    expect(locales).toHaveLength(3);
    expect(locales.map((l) => l.locale).sort()).toEqual(["default", "ru", "uk"]);
  });

  it("discovers regional locale (values-pt-rBR)", () => {
    createLocale(tmpDir, "values");
    createLocale(tmpDir, "values-pt-rBR");
    const locales = discoverLocales(tmpDir);
    expect(locales).toHaveLength(2);
    expect(locales[1].locale).toBe("pt-rBR");
  });

  it("discovers 3-letter language code (values-fil)", () => {
    createLocale(tmpDir, "values-fil");
    const locales = discoverLocales(tmpDir);
    expect(locales).toHaveLength(1);
    expect(locales[0].locale).toBe("fil");
  });

  it("ignores non-locale values dirs (values-night, values-v21)", () => {
    createLocale(tmpDir, "values");
    // Create dirs that look like values-* but aren't locales
    const nightDir = path.join(tmpDir, "values-night");
    fs.mkdirSync(nightDir, { recursive: true });
    fs.writeFileSync(path.join(nightDir, "strings.xml"), "<resources/>", "utf-8");

    const v21Dir = path.join(tmpDir, "values-v21");
    fs.mkdirSync(v21Dir, { recursive: true });
    fs.writeFileSync(path.join(v21Dir, "strings.xml"), "<resources/>", "utf-8");

    const locales = discoverLocales(tmpDir);
    expect(locales).toHaveLength(1);
    expect(locales[0].locale).toBe("default");
  });

  it("ignores locale dirs without strings.xml", () => {
    createLocale(tmpDir, "values");
    fs.mkdirSync(path.join(tmpDir, "values-fr"), { recursive: true });
    // No strings.xml in values-fr
    const locales = discoverLocales(tmpDir);
    expect(locales).toHaveLength(1);
  });

  it("returns empty for dir with no values", () => {
    expect(discoverLocales(tmpDir)).toEqual([]);
  });

  it("sets correct file paths", () => {
    createLocale(tmpDir, "values");
    createLocale(tmpDir, "values-es");
    const locales = discoverLocales(tmpDir);
    const def = locales.find((l) => l.locale === "default");
    expect(def?.filePath).toBe(path.join(tmpDir, "values", "strings.xml"));
    const es = locales.find((l) => l.locale === "es");
    expect(es?.filePath).toBe(path.join(tmpDir, "values-es", "strings.xml"));
  });

  it("uses ANDROID_DEFAULT_LOCALE env var to pick default folder", () => {
    process.env.ANDROID_DEFAULT_LOCALE = "en";
    createLocale(tmpDir, "values-en");
    createLocale(tmpDir, "values-ru");
    const locales = discoverLocales(tmpDir);
    expect(locales).toHaveLength(2);
    expect(locales.find((l) => l.locale === "default")?.filePath).toBe(
      path.join(tmpDir, "values-en", "strings.xml")
    );
    expect(locales.find((l) => l.locale === "ru")).toBeDefined();
  });

  it("falls back to values/ when ANDROID_DEFAULT_LOCALE is not set", () => {
    delete process.env.ANDROID_DEFAULT_LOCALE;
    createLocale(tmpDir, "values");
    const locales = discoverLocales(tmpDir);
    expect(locales[0].locale).toBe("default");
    expect(locales[0].filePath).toBe(path.join(tmpDir, "values", "strings.xml"));
  });

  it("does not double-count the default locale folder in non-default list", () => {
    process.env.ANDROID_DEFAULT_LOCALE = "en";
    createLocale(tmpDir, "values-en");
    createLocale(tmpDir, "values-ru");
    const locales = discoverLocales(tmpDir);
    const localeNames = locales.map((l) => l.locale);
    expect(localeNames).not.toContain("en");
    expect(localeNames).toContain("default");
    expect(localeNames).toContain("ru");
  });
});

describe("validateResDir", () => {
  it("returns null for valid dir", () => {
    createLocale(tmpDir, "values");
    expect(validateResDir(tmpDir)).toBeNull();
  });

  it("returns error for empty string", () => {
    expect(validateResDir("")).toContain("No res directory specified");
  });

  it("returns error for non-existent dir", () => {
    expect(validateResDir("/nonexistent/dir")).toContain("not found");
  });

  it("returns error for dir with no strings.xml", () => {
    expect(validateResDir(tmpDir)).toContain("No strings.xml");
  });
});
