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
    expect(result!.text).toContain('<string name="hello">Hello</string>');
    expect(result!.uri).toBe("android-strings://default/strings.xml");
    expect(result!.mimeType).toBe("application/xml");
  });

  it("returns null for unknown locale", () => {
    createLocale("values", STRINGS);
    expect(readResourceByLocale("fr", [tmpDir])).toBeNull();
  });
});
