import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  findUnusedKeys,
  getTranslationStats,
  lintStrings,
} from "../analysis.js";

let tmpDir: string;
let resDir: string;
let srcDir: string;

function createLocale(folder: string, content: string): void {
  const dir = path.join(resDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "strings.xml"), content, "utf-8");
}

function createSourceFile(relativePath: string, content: string): void {
  const fullPath = path.join(srcDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
}

const DEFAULT_STRINGS = `<?xml version="1.0"?>
<resources>
    <string name="app_name" translatable="false">MyApp</string>
    <string name="hello">Hello</string>
    <string name="goodbye">Goodbye</string>
    <string name="unused_key">Not used anywhere</string>
    <string name="greeting">Hello %1$s, you have %2$d messages</string>
</resources>`;

const RU_STRINGS = `<?xml version="1.0"?>
<resources>
    <string name="hello">Привет</string>
    <string name="goodbye">До свидания</string>
    <string name="greeting">Привет %1$s, у вас %2$d сообщений</string>
</resources>`;

const UK_STRINGS = `<?xml version="1.0"?>
<resources>
    <string name="hello">Привіт</string>
    <string name="greeting">Привіт %1$s, у вас %2$d повідомлень</string>
</resources>`;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asm-analysis-test-"));
  resDir = path.join(tmpDir, "res");
  srcDir = path.join(tmpDir, "src");
  fs.mkdirSync(resDir, { recursive: true });
  fs.mkdirSync(srcDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// --- findUnusedKeys ---

describe("findUnusedKeys", () => {
  it("detects keys not referenced in source code", () => {
    createLocale("values", DEFAULT_STRINGS);
    createSourceFile("Main.kt", `
      val text = getString(R.string.hello)
      val bye = R.string.goodbye
      val greet = R.string.greeting
    `);

    const unused = findUnusedKeys(resDir, [srcDir]);
    expect(unused).toContain("unused_key");
    expect(unused).not.toContain("hello");
    expect(unused).not.toContain("goodbye");
    expect(unused).not.toContain("greeting");
  });

  it("excludes non-translatable keys from unused check", () => {
    createLocale("values", DEFAULT_STRINGS);
    createSourceFile("Main.kt", `
      R.string.hello
      R.string.goodbye
      R.string.greeting
    `);

    const unused = findUnusedKeys(resDir, [srcDir]);
    expect(unused).not.toContain("app_name");
    expect(unused).toContain("unused_key");
  });

  it("detects references in XML layouts", () => {
    createLocale("values", DEFAULT_STRINGS);
    createSourceFile("layout/main.xml", `
      <TextView android:text="@string/unused_key" />
      <Button android:text="@string/hello" />
    `);
    createSourceFile("Main.kt", `
      R.string.goodbye
      R.string.greeting
    `);

    const unused = findUnusedKeys(resDir, [srcDir]);
    expect(unused).not.toContain("unused_key");
    expect(unused).not.toContain("hello");
  });

  it("returns empty when all keys are used", () => {
    createLocale("values", `<?xml version="1.0"?>
<resources>
    <string name="hello">Hello</string>
</resources>`);
    createSourceFile("Main.kt", "R.string.hello");

    expect(findUnusedKeys(resDir, [srcDir])).toEqual([]);
  });

  it("scans multiple source directories", () => {
    createLocale("values", DEFAULT_STRINGS);
    const srcDir2 = path.join(tmpDir, "src2");
    fs.mkdirSync(srcDir2, { recursive: true });
    createSourceFile("A.kt", "R.string.hello\nR.string.goodbye");
    fs.mkdirSync(path.join(srcDir2, "sub"), { recursive: true });
    fs.writeFileSync(path.join(srcDir2, "sub/B.kt"), "R.string.greeting\nR.string.unused_key", "utf-8");

    const unused = findUnusedKeys(resDir, [srcDir, srcDir2]);
    expect(unused).toEqual([]);
  });
});

// --- getTranslationStats ---

describe("getTranslationStats", () => {
  it("calculates per-locale completion stats", () => {
    createLocale("values", DEFAULT_STRINGS);
    createLocale("values-ru", RU_STRINGS);
    createLocale("values-uk", UK_STRINGS);

    const stats = getTranslationStats(resDir);

    // default has 4 translatable keys (app_name is non-translatable)
    expect(stats.totalTranslatable).toBe(4);

    const ru = stats.locales.find((l) => l.locale === "ru");
    expect(ru).toBeDefined();
    expect(ru!.present).toBe(3);
    expect(ru!.missing).toBe(1);
    expect(ru!.missingKeys).toEqual(["unused_key"]);

    const uk = stats.locales.find((l) => l.locale === "uk");
    expect(uk).toBeDefined();
    expect(uk!.present).toBe(2);
    expect(uk!.missing).toBe(2);
    expect(uk!.missingKeys).toContain("goodbye");
    expect(uk!.missingKeys).toContain("unused_key");
  });

  it("reports 100% for fully translated locale", () => {
    createLocale("values", `<?xml version="1.0"?>
<resources>
    <string name="hello">Hello</string>
</resources>`);
    createLocale("values-ru", `<?xml version="1.0"?>
<resources>
    <string name="hello">Привет</string>
</resources>`);

    const stats = getTranslationStats(resDir);
    const ru = stats.locales.find((l) => l.locale === "ru");
    expect(ru!.percent).toBe(100);
    expect(ru!.missing).toBe(0);
  });

  it("skips non-translatable keys", () => {
    createLocale("values", `<?xml version="1.0"?>
<resources>
    <string name="app_name" translatable="false">MyApp</string>
    <string name="hello">Hello</string>
</resources>`);
    createLocale("values-ru", `<?xml version="1.0"?>
<resources>
    <string name="hello">Привет</string>
</resources>`);

    const stats = getTranslationStats(resDir);
    expect(stats.totalTranslatable).toBe(1);
    expect(stats.locales.find((l) => l.locale === "ru")!.percent).toBe(100);
  });

  it("handles locale with no strings.xml gracefully", () => {
    createLocale("values", DEFAULT_STRINGS);
    const stats = getTranslationStats(resDir);
    // Only default locale, no other locales to compare
    expect(stats.locales).toHaveLength(0);
  });
});

// --- lintStrings ---

describe("lintStrings", () => {
  it("produces a combined report with all issue types", () => {
    createLocale("values", `<?xml version="1.0"?>
<resources>
    <string name="hello">Hello</string>
    <string name="greeting">Hello %1$s</string>
    <string name="farewell">Bye</string>
    <string name="unused">Not used</string>
    <string name="dup1">Same value</string>
    <string name="dup2">Same value</string>
</resources>`);
    createLocale("values-ru", `<?xml version="1.0"?>
<resources>
    <string name="hello">Привет</string>
    <string name="greeting">Привет %1$s %2$d</string>
</resources>`);
    createSourceFile("Main.kt", `
      R.string.hello
      R.string.greeting
      R.string.farewell
      R.string.dup1
      R.string.dup2
    `);

    const report = lintStrings(resDir, [srcDir]);

    expect(report.missing.length).toBeGreaterThan(0);
    expect(report.placeholderMismatches.length).toBeGreaterThan(0);
    expect(report.duplicates.length).toBeGreaterThan(0);
    expect(report.unused.length).toBeGreaterThan(0);
    expect(report.unused).toContain("unused");
  });

  it("returns empty report for clean project", () => {
    createLocale("values", `<?xml version="1.0"?>
<resources>
    <string name="hello">Hello</string>
</resources>`);
    createLocale("values-ru", `<?xml version="1.0"?>
<resources>
    <string name="hello">Привет</string>
</resources>`);
    createSourceFile("Main.kt", "R.string.hello");

    const report = lintStrings(resDir, [srcDir]);
    expect(report.missing).toEqual([]);
    expect(report.placeholderMismatches).toEqual([]);
    expect(report.duplicates).toEqual([]);
    expect(report.unused).toEqual([]);
  });
});
