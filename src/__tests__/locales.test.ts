import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { discoverLocales, validateResDir, getResDirs, validateResDirs } from "../locales.js";

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

describe("getResDirs", () => {
  it("returns single dir from param", () => {
    const dirs = getResDirs("/some/path");
    expect(dirs).toEqual(["/some/path"]);
  });

  it("splits comma-separated param", () => {
    const dirs = getResDirs("/path/a,/path/b");
    expect(dirs).toEqual(["/path/a", "/path/b"]);
  });

  it("splits comma-separated env var", () => {
    const origEnv = process.env.ANDROID_RES_DIR;
    process.env.ANDROID_RES_DIR = "/env/a,/env/b";
    const dirs = getResDirs();
    expect(dirs).toEqual(["/env/a", "/env/b"]);
    process.env.ANDROID_RES_DIR = origEnv;
  });

  it("trims whitespace around paths", () => {
    const dirs = getResDirs(" /a , /b ");
    expect(dirs).toEqual(["/a", "/b"]);
  });
});

describe("discoverLocales with multiple resDirs", () => {
  it("merges locales from multiple res directories", () => {
    const resDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "asm-locale-test2-"));
    createLocale(tmpDir, "values");
    createLocale(tmpDir, "values-ru");
    createLocale(resDir2, "values-uk");

    const locales = discoverLocales([tmpDir, resDir2]);
    const names = locales.map((l) => l.locale).sort();
    expect(names).toEqual(["default", "ru", "uk"]);

    fs.rmSync(resDir2, { recursive: true, force: true });
  });

  it("deduplicates same locale across modules (first wins)", () => {
    const resDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "asm-locale-test2-"));
    createLocale(tmpDir, "values");
    createLocale(tmpDir, "values-ru");
    createLocale(resDir2, "values");
    createLocale(resDir2, "values-ru");

    const locales = discoverLocales([tmpDir, resDir2]);
    const defaults = locales.filter((l) => l.locale === "default");
    expect(defaults).toHaveLength(1);
    expect(defaults[0].filePath).toBe(path.join(tmpDir, "values", "strings.xml"));

    const ruLocales = locales.filter((l) => l.locale === "ru");
    expect(ruLocales).toHaveLength(1);
    expect(ruLocales[0].filePath).toBe(path.join(tmpDir, "values-ru", "strings.xml"));

    fs.rmSync(resDir2, { recursive: true, force: true });
  });

  it("still works with single string arg (backward compat)", () => {
    createLocale(tmpDir, "values");
    const locales = discoverLocales(tmpDir);
    expect(locales).toHaveLength(1);
    expect(locales[0].locale).toBe("default");
  });
});

describe("validateResDirs", () => {
  it("returns null for valid dirs", () => {
    createLocale(tmpDir, "values");
    expect(validateResDirs([tmpDir])).toBeNull();
  });

  it("returns error for empty array", () => {
    expect(validateResDirs([])).toContain("No res directory");
  });

  it("returns error if a dir does not exist", () => {
    expect(validateResDirs(["/nonexistent"])).toContain("not found");
  });
});
