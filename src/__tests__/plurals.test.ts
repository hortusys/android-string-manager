import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  parsePluralsXml,
  insertPluralInXml,
  updatePluralInXml,
  deletePluralFromXml,
} from "../xml.js";

let tmpDir: string;
let testFile: string;

function writeTestFile(content: string): string {
  fs.writeFileSync(testFile, content, "utf-8");
  return testFile;
}

function readTestFile(): string {
  return fs.readFileSync(testFile, "utf-8");
}

const PLURALS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <plurals name="items_count">
        <item quantity="one">%d item</item>
        <item quantity="other">%d items</item>
    </plurals>
</resources>`;

const EMPTY_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
</resources>`;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asm-plural-test-"));
  testFile = path.join(tmpDir, "strings.xml");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// --- insertPluralInXml ---

describe("insertPluralInXml", () => {
  it("inserts a new plural at end", () => {
    writeTestFile(EMPTY_XML);
    insertPluralInXml(testFile, "days", [
      { quantity: "one", value: "%d day" },
      { quantity: "other", value: "%d days" },
    ]);
    const entries = parsePluralsXml(testFile);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("days");
    expect(entries[0].items).toEqual([
      { quantity: "one", value: "%d day" },
      { quantity: "other", value: "%d days" },
    ]);
  });

  it("preserves existing content", () => {
    writeTestFile(PLURALS_XML);
    insertPluralInXml(testFile, "days", [
      { quantity: "one", value: "%d day" },
      { quantity: "other", value: "%d days" },
    ]);
    const entries = parsePluralsXml(testFile);
    expect(entries).toHaveLength(2);
    expect(entries[0].name).toBe("items_count");
    expect(entries[1].name).toBe("days");
  });

  it("generates proper XML indentation", () => {
    writeTestFile(EMPTY_XML);
    insertPluralInXml(testFile, "test", [
      { quantity: "one", value: "one" },
    ]);
    const content = readTestFile();
    expect(content).toContain("    <plurals name=\"test\">");
    expect(content).toContain("        <item quantity=\"one\">one</item>");
    expect(content).toContain("    </plurals>");
  });
});

// --- updatePluralInXml ---

describe("updatePluralInXml", () => {
  it("updates an existing plural", () => {
    writeTestFile(PLURALS_XML);
    const result = updatePluralInXml(testFile, "items_count", [
      { quantity: "one", value: "%d thing" },
      { quantity: "other", value: "%d things" },
    ]);
    expect(result).toBe(true);
    const entries = parsePluralsXml(testFile);
    expect(entries[0].items).toEqual([
      { quantity: "one", value: "%d thing" },
      { quantity: "other", value: "%d things" },
    ]);
  });

  it("returns false for non-existent key", () => {
    writeTestFile(PLURALS_XML);
    const result = updatePluralInXml(testFile, "nonexistent", [
      { quantity: "one", value: "x" },
    ]);
    expect(result).toBe(false);
  });

  it("can change the number of quantities", () => {
    writeTestFile(PLURALS_XML);
    updatePluralInXml(testFile, "items_count", [
      { quantity: "one", value: "%d item" },
      { quantity: "few", value: "%d items" },
      { quantity: "other", value: "%d items" },
    ]);
    const entries = parsePluralsXml(testFile);
    expect(entries[0].items).toHaveLength(3);
  });
});

// --- deletePluralFromXml ---

describe("deletePluralFromXml", () => {
  it("deletes an existing plural", () => {
    writeTestFile(PLURALS_XML);
    const result = deletePluralFromXml(testFile, "items_count");
    expect(result).toBe(true);
    const entries = parsePluralsXml(testFile);
    expect(entries).toHaveLength(0);
  });

  it("returns false for non-existent key", () => {
    writeTestFile(PLURALS_XML);
    const result = deletePluralFromXml(testFile, "nonexistent");
    expect(result).toBe(false);
  });

  it("preserves other content", () => {
    writeTestFile(`<?xml version="1.0"?>
<resources>
    <string name="hello">Hello</string>
    <plurals name="items_count">
        <item quantity="one">%d item</item>
        <item quantity="other">%d items</item>
    </plurals>
    <string name="bye">Bye</string>
</resources>`);
    deletePluralFromXml(testFile, "items_count");
    const content = readTestFile();
    expect(content).toContain("hello");
    expect(content).toContain("bye");
    expect(content).not.toContain("items_count");
  });

  it("insert then delete round-trip", () => {
    writeTestFile(EMPTY_XML);
    insertPluralInXml(testFile, "test", [
      { quantity: "one", value: "1" },
      { quantity: "other", value: "N" },
    ]);
    expect(parsePluralsXml(testFile)).toHaveLength(1);
    deletePluralFromXml(testFile, "test");
    expect(parsePluralsXml(testFile)).toHaveLength(0);
  });
});
