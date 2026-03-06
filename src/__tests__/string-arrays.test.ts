import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  parseStringArraysXml,
  insertStringArrayInXml,
  updateStringArrayInXml,
  deleteStringArrayFromXml,
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

const ARRAY_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string-array name="colors">
        <item>Red</item>
        <item>Green</item>
        <item>Blue</item>
    </string-array>
</resources>`;

const EMPTY_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
</resources>`;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asm-array-test-"));
  testFile = path.join(tmpDir, "strings.xml");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// --- insertStringArrayInXml ---

describe("insertStringArrayInXml", () => {
  it("inserts a new string-array", () => {
    writeTestFile(EMPTY_XML);
    insertStringArrayInXml(testFile, "sizes", ["Small", "Medium", "Large"]);
    const entries = parseStringArraysXml(testFile);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("sizes");
    expect(entries[0].items).toEqual(["Small", "Medium", "Large"]);
  });

  it("preserves existing content", () => {
    writeTestFile(ARRAY_XML);
    insertStringArrayInXml(testFile, "sizes", ["S", "M"]);
    const entries = parseStringArraysXml(testFile);
    expect(entries).toHaveLength(2);
    expect(entries[0].name).toBe("colors");
    expect(entries[1].name).toBe("sizes");
  });

  it("generates proper XML indentation", () => {
    writeTestFile(EMPTY_XML);
    insertStringArrayInXml(testFile, "test", ["A", "B"]);
    const content = readTestFile();
    expect(content).toContain('    <string-array name="test">');
    expect(content).toContain("        <item>A</item>");
    expect(content).toContain("    </string-array>");
  });

  it("handles single item array", () => {
    writeTestFile(EMPTY_XML);
    insertStringArrayInXml(testFile, "single", ["Only"]);
    const entries = parseStringArraysXml(testFile);
    expect(entries[0].items).toEqual(["Only"]);
  });
});

// --- updateStringArrayInXml ---

describe("updateStringArrayInXml", () => {
  it("updates existing string-array items", () => {
    writeTestFile(ARRAY_XML);
    const result = updateStringArrayInXml(testFile, "colors", ["Cyan", "Magenta", "Yellow"]);
    expect(result).toBe(true);
    const entries = parseStringArraysXml(testFile);
    expect(entries[0].items).toEqual(["Cyan", "Magenta", "Yellow"]);
  });

  it("returns false for non-existent key", () => {
    writeTestFile(ARRAY_XML);
    expect(updateStringArrayInXml(testFile, "nonexistent", ["x"])).toBe(false);
  });

  it("can change the number of items", () => {
    writeTestFile(ARRAY_XML);
    updateStringArrayInXml(testFile, "colors", ["Black", "White"]);
    const entries = parseStringArraysXml(testFile);
    expect(entries[0].items).toHaveLength(2);
  });
});

// --- deleteStringArrayFromXml ---

describe("deleteStringArrayFromXml", () => {
  it("deletes an existing string-array", () => {
    writeTestFile(ARRAY_XML);
    const result = deleteStringArrayFromXml(testFile, "colors");
    expect(result).toBe(true);
    expect(parseStringArraysXml(testFile)).toHaveLength(0);
  });

  it("returns false for non-existent key", () => {
    writeTestFile(ARRAY_XML);
    expect(deleteStringArrayFromXml(testFile, "nonexistent")).toBe(false);
  });

  it("preserves other content", () => {
    writeTestFile(`<?xml version="1.0"?>
<resources>
    <string name="hello">Hello</string>
    <string-array name="colors">
        <item>Red</item>
    </string-array>
    <string name="bye">Bye</string>
</resources>`);
    deleteStringArrayFromXml(testFile, "colors");
    const content = readTestFile();
    expect(content).toContain("hello");
    expect(content).toContain("bye");
    expect(content).not.toContain("colors");
  });

  it("insert then delete round-trip", () => {
    writeTestFile(EMPTY_XML);
    insertStringArrayInXml(testFile, "test", ["A", "B"]);
    expect(parseStringArraysXml(testFile)).toHaveLength(1);
    deleteStringArrayFromXml(testFile, "test");
    expect(parseStringArraysXml(testFile)).toHaveLength(0);
  });
});
