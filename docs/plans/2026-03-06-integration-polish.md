# Integration & Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add MCP resources, configurable default locale, multi-res directory support, and GitHub Actions CI.

**Architecture:** Items 11 and 12 modify `locales.ts` (the foundation all tools depend on). Item 8 adds a new `resources.ts` file using the SDK's `ResourceTemplate` API. Item 10 is a standalone CI config. Order: 11 → 12 → 8 → 10 (foundation first, dependents after).

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk` (McpServer, ResourceTemplate), vitest, GitHub Actions

---

### Task 1: Configurable Default Locale (Item 11)

**Files:**
- Modify: `src/locales.ts:9-29`
- Test: `src/__tests__/locales.test.ts`

**Step 1: Write failing tests for `ANDROID_DEFAULT_LOCALE`**

Add these tests to the `discoverLocales` describe block in `src/__tests__/locales.test.ts`:

```typescript
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
```

Also add cleanup in `afterEach`:
```typescript
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.ANDROID_DEFAULT_LOCALE;
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/locales.test.ts`
Expected: 3 new tests FAIL

**Step 3: Implement configurable default locale in `locales.ts`**

Modify `discoverLocales` in `src/locales.ts`:

```typescript
export function discoverLocales(resDir: string): LocaleConfig[] {
  const locales: LocaleConfig[] = [];
  const defaultLocaleName = process.env.ANDROID_DEFAULT_LOCALE;

  if (defaultLocaleName) {
    // Custom default locale folder (e.g. values-en/)
    const customDefault = path.join(resDir, `values-${defaultLocaleName}`, "strings.xml");
    if (fs.existsSync(customDefault)) {
      locales.push({ locale: "default", filePath: customDefault });
    }
  } else {
    // Standard values/ folder
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
    // Skip if this locale is the configured default
    if (defaultLocaleName && match[1] === defaultLocaleName) continue;
    const stringsFile = path.join(resDir, entry.name, "strings.xml");
    if (fs.existsSync(stringsFile)) {
      locales.push({ locale: match[1], filePath: stringsFile });
    }
  }

  return locales;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/locales.test.ts`
Expected: All tests PASS (12 old + 3 new = 15)

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All 105 tests PASS

**Step 6: Commit**

```bash
git add src/locales.ts src/__tests__/locales.test.ts
git commit -m "[Feature] Add configurable default locale via ANDROID_DEFAULT_LOCALE env var"
```

---

### Task 2: Multiple res/ Directories (Item 12)

**Files:**
- Modify: `src/locales.ts`
- Modify: All 13 files in `src/tools/*.ts` (mechanical: `getResDir` → `getResDirs`, `validateResDir` → `validateResDirs`, `discoverLocales(dir)` → `discoverLocales(dirs)`)
- Modify: `src/analysis.ts:34,61,92`
- Test: `src/__tests__/locales.test.ts`

**Step 1: Write failing tests for multi-res**

Add new describe block in `src/__tests__/locales.test.ts`:

```typescript
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
    process.env.ANDROID_RES_DIR = "/env/a,/env/b";
    const dirs = getResDirs();
    expect(dirs).toEqual(["/env/a", "/env/b"]);
    delete process.env.ANDROID_RES_DIR;
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
```

Update the import in test file:
```typescript
import { discoverLocales, validateResDir, getResDirs, validateResDirs } from "../locales.js";
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/locales.test.ts`
Expected: FAIL — `getResDirs` and `validateResDirs` not exported

**Step 3: Implement multi-res in `locales.ts`**

Add `getResDirs` function:
```typescript
export function getResDirs(resDir?: string): string[] {
  const raw = resDir || process.env.ANDROID_RES_DIR || "";
  if (!raw) return [];
  return raw.split(",").map((d) => d.trim()).filter(Boolean);
}
```

Modify `discoverLocales` signature to accept `string | string[]`:
```typescript
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

  // ... existing single-dir logic unchanged ...
}
```

Add `validateResDirs`:
```typescript
export function validateResDirs(resDirs: string[]): string | null {
  if (resDirs.length === 0) return "No res directory specified. Set ANDROID_RES_DIR env var or pass resDir.";
  for (const dir of resDirs) {
    if (!fs.existsSync(dir)) return `Resource directory not found: ${dir}`;
  }
  const locales = discoverLocales(resDirs);
  if (locales.length === 0) return `No strings.xml files found in: ${resDirs.join(", ")}`;
  return null;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/locales.test.ts`
Expected: All tests PASS

**Step 5: Update all tools to use `getResDirs` + `validateResDirs`**

Mechanical change in every tool file — replace the 3-line pattern:
```typescript
// Before:
const dir = getResDir(resDir);
const err = validateResDir(dir);
// ...
const locales = discoverLocales(dir);

// After:
const dirs = getResDirs(resDir);
const err = validateResDirs(dirs);
// ...
const locales = discoverLocales(dirs);
```

Update imports in each tool from:
```typescript
import { discoverLocales, getResDir, validateResDir } from "../locales.js";
```
to:
```typescript
import { discoverLocales, getResDirs, validateResDirs } from "../locales.js";
```

Files to update (13 tool files):
- `src/tools/add-string.ts` (2 occurrences)
- `src/tools/get-string.ts`
- `src/tools/update-string.ts`
- `src/tools/delete-string.ts`
- `src/tools/rename-key.ts`
- `src/tools/search-strings.ts`
- `src/tools/list-locales.ts`
- `src/tools/list-missing.ts`
- `src/tools/sort-strings.ts`
- `src/tools/validate-placeholders.ts`
- `src/tools/find-duplicates.ts`
- `src/tools/export-csv.ts` (2 occurrences)
- `src/tools/git-diff.ts`
- `src/tools/plurals.ts` (3 occurrences)
- `src/tools/string-arrays.ts` (3 occurrences)
- `src/tools/analysis.ts` (3 occurrences)

Also update `src/analysis.ts` — the 3 functions that call `discoverLocales(resDir)` already receive a single `resDir: string`, which still works due to the `string | string[]` overload. No changes needed there.

**Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src/locales.ts src/__tests__/locales.test.ts src/tools/ src/analysis.ts
git commit -m "[Feature] Support multiple res/ directories via comma-separated ANDROID_RES_DIR"
```

---

### Task 3: MCP Resources (Item 8)

**Files:**
- Create: `src/resources.ts`
- Modify: `src/index.ts:1-25`
- Test: `src/__tests__/resources.test.ts`

**Step 1: Write failing test for resource registration**

Create `src/__tests__/resources.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { buildResourceList, readResourceByLocale } from "../resources.js";

let tmpDir: string;

function createLocale(folder: string, content: string): void {
  const dir = path.join(tmpDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "strings.xml"), content, "utf-8");
}

const STRINGS = `<?xml version="1.0"?>
<resources>
    <string name="hello">Hello</string>
</resources>`;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asm-resource-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("buildResourceList", () => {
  it("returns a resource entry per locale", () => {
    createLocale("values", STRINGS);
    createLocale("values-ru", STRINGS);
    const resources = buildResourceList([tmpDir]);
    expect(resources).toHaveLength(2);
    expect(resources[0].uri).toBe("android-strings://default/strings.xml");
    expect(resources[0].name).toBe("strings.xml (default)");
    expect(resources[1].uri).toBe("android-strings://ru/strings.xml");
  });

  it("returns empty for no locales", () => {
    expect(buildResourceList([tmpDir])).toEqual([]);
  });
});

describe("readResourceByLocale", () => {
  it("returns file content for valid locale", () => {
    createLocale("values", STRINGS);
    const result = readResourceByLocale("default", [tmpDir]);
    expect(result).not.toBeNull();
    expect(result!.text).toContain("<string name=\"hello\">Hello</string>");
    expect(result!.uri).toBe("android-strings://default/strings.xml");
    expect(result!.mimeType).toBe("application/xml");
  });

  it("returns null for unknown locale", () => {
    createLocale("values", STRINGS);
    expect(readResourceByLocale("fr", [tmpDir])).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/resources.test.ts`
Expected: FAIL — `resources.js` module not found

**Step 3: Implement `resources.ts`**

Create `src/resources.ts`:

```typescript
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { discoverLocales } from "./locales.js";

export interface ResourceEntry {
  uri: string;
  name: string;
  mimeType: string;
}

export function buildResourceList(resDirs: string[]): ResourceEntry[] {
  const locales = discoverLocales(resDirs);
  return locales.map((l) => ({
    uri: `android-strings://${l.locale}/strings.xml`,
    name: `strings.xml (${l.locale})`,
    mimeType: "application/xml",
  }));
}

export function readResourceByLocale(
  locale: string,
  resDirs: string[]
): { uri: string; mimeType: string; text: string } | null {
  const locales = discoverLocales(resDirs);
  const lc = locales.find((l) => l.locale === locale);
  if (!lc) return null;
  const fs = require("fs");
  const text = fs.readFileSync(lc.filePath, "utf-8");
  return {
    uri: `android-strings://${locale}/strings.xml`,
    mimeType: "application/xml",
    text,
  };
}

export function registerResources(server: McpServer, resDirs: string[]): void {
  server.resource(
    "strings-xml",
    new ResourceTemplate("android-strings://{locale}/strings.xml", {
      list: async () => ({
        resources: buildResourceList(resDirs).map((r) => ({
          uri: r.uri,
          name: r.name,
          mimeType: r.mimeType,
        })),
      }),
    }),
    { description: "Android strings.xml files by locale", mimeType: "application/xml" },
    async (uri, { locale }) => {
      const result = readResourceByLocale(locale as string, resDirs);
      if (!result) {
        return { contents: [{ uri: uri.href, mimeType: "text/plain", text: `Locale "${locale}" not found.` }] };
      }
      return { contents: [{ uri: uri.href, mimeType: result.mimeType, text: result.text }] };
    }
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/resources.test.ts`
Expected: All tests PASS

**Step 5: Wire resources into `index.ts`**

Add import and call after server creation in `src/index.ts`:

```typescript
import { registerResources } from "./resources.js";
import { getResDirs } from "./locales.js";
```

After all tool registrations (before `async function main()`):

```typescript
// Resources
registerResources(server, getResDirs());
```

**Step 6: Build and run full test suite**

Run: `npm run build && npx vitest run`
Expected: Build succeeds, all tests PASS

**Step 7: Commit**

```bash
git add src/resources.ts src/__tests__/resources.test.ts src/index.ts
git commit -m "[Feature] Expose strings.xml as MCP resources via android-strings://{locale}/strings.xml"
```

---

### Task 4: GitHub Actions CI (Item 10)

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Create CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  build-and-test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [20, 22]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Test
        run: npm test
```

**Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "[CI] Add GitHub Actions workflow for build and test"
```

---

### Task 5: Version Bump & Final Verification

**Files:**
- Modify: `package.json:2` (version)
- Modify: `src/index.ts:24` (version)

**Step 1: Bump version to 2.3.0**

In `package.json` and `src/index.ts`, change `"2.2.0"` → `"2.3.0"`.

**Step 2: Full build + test**

Run: `npm run build && npx vitest run`
Expected: Build clean, all tests PASS

**Step 3: Commit and push**

```bash
git add package.json src/index.ts
git commit -m "[Release] Bump version to 2.3.0"
git push
```
