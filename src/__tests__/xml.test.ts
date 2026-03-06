import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  escapeXml,
  escapeRegex,
  extractPlaceholders,
  parseStringsXml,
  parsePluralsXml,
  parseStringArraysXml,
  insertStringInXml,
  updateStringInXml,
  deleteStringFromXml,
  renameStringInXml,
  sortStringsInXml,
} from "../xml.js";

// --- Test helpers ---

let tmpDir: string;
let testFile: string;

function writeTestFile(content: string): string {
  fs.writeFileSync(testFile, content, "utf-8");
  return testFile;
}

function readTestFile(): string {
  return fs.readFileSync(testFile, "utf-8");
}

const BASIC_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name" translatable="false">MyApp</string>
    <string name="hello">Hello</string>
    <string name="goodbye">Goodbye</string>
</resources>`;

const PLURALS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <plurals name="items_count">
        <item quantity="one">%d item</item>
        <item quantity="other">%d items</item>
    </plurals>
    <plurals name="days">
        <item quantity="one">%d day</item>
        <item quantity="few">%d days</item>
        <item quantity="other">%d days</item>
    </plurals>
</resources>`;

const STRING_ARRAYS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string-array name="colors">
        <item>Red</item>
        <item>Green</item>
        <item>Blue</item>
    </string-array>
</resources>`;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asm-test-"));
  testFile = path.join(tmpDir, "strings.xml");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// --- escapeXml ---

describe("escapeXml", () => {
  it("escapes ampersand", () => {
    expect(escapeXml("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("escapes angle brackets", () => {
    expect(escapeXml("<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("escapes quotes", () => {
    expect(escapeXml('"hello"')).toBe("&quot;hello&quot;");
  });

  it("escapes apostrophes for Android", () => {
    expect(escapeXml("it's")).toBe("it\\'s");
  });

  it("handles multiple special chars", () => {
    expect(escapeXml('A & B < "C"')).toBe("A &amp; B &lt; &quot;C&quot;");
  });

  it("returns empty string unchanged", () => {
    expect(escapeXml("")).toBe("");
  });
});

// --- escapeRegex ---

describe("escapeRegex", () => {
  it("escapes regex special characters", () => {
    expect(escapeRegex("hello.world")).toBe("hello\\.world");
    expect(escapeRegex("foo[0]")).toBe("foo\\[0\\]");
    expect(escapeRegex("a+b*c?")).toBe("a\\+b\\*c\\?");
  });

  it("handles string with no special chars", () => {
    expect(escapeRegex("hello_world")).toBe("hello_world");
  });
});

// --- extractPlaceholders ---

describe("extractPlaceholders", () => {
  it("extracts simple placeholders", () => {
    expect(extractPlaceholders("Hello %s")).toEqual(["%s"]);
    expect(extractPlaceholders("Count: %d")).toEqual(["%d"]);
  });

  it("extracts positional placeholders", () => {
    expect(extractPlaceholders("%1$s - %2$s")).toEqual(["%1$s", "%2$s"]);
  });

  it("extracts mixed placeholders sorted", () => {
    expect(extractPlaceholders("%2$d items in %1$s")).toEqual(["%1$s", "%2$d"]);
  });

  it("returns empty for no placeholders", () => {
    expect(extractPlaceholders("Hello world")).toEqual([]);
  });

  it("handles float placeholder", () => {
    expect(extractPlaceholders("%.2f kg")).toEqual([]);
    expect(extractPlaceholders("%f kg")).toEqual(["%f"]);
  });

  it("handles char placeholder", () => {
    expect(extractPlaceholders("Letter: %c")).toEqual(["%c"]);
  });
});

// --- parseStringsXml ---

describe("parseStringsXml", () => {
  it("parses basic strings", () => {
    writeTestFile(BASIC_XML);
    const entries = parseStringsXml(testFile);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ name: "app_name", value: "MyApp", translatable: false });
    expect(entries[1]).toEqual({ name: "hello", value: "Hello", translatable: true });
    expect(entries[2]).toEqual({ name: "goodbye", value: "Goodbye", translatable: true });
  });

  it("returns empty for non-existent file", () => {
    expect(parseStringsXml("/nonexistent/strings.xml")).toEqual([]);
  });

  it("returns empty for file with no strings", () => {
    writeTestFile('<?xml version="1.0"?>\n<resources>\n</resources>');
    expect(parseStringsXml(testFile)).toEqual([]);
  });

  it("handles multiline values", () => {
    writeTestFile(`<?xml version="1.0"?>
<resources>
    <string name="long">Line one
Line two</string>
</resources>`);
    const entries = parseStringsXml(testFile);
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe("Line one\nLine two");
  });

  it("handles values with special XML chars (already escaped in file)", () => {
    writeTestFile(`<?xml version="1.0"?>
<resources>
    <string name="special">Tom &amp; Jerry</string>
</resources>`);
    const entries = parseStringsXml(testFile);
    expect(entries[0].value).toBe("Tom &amp; Jerry");
  });

  it("handles strings with format args", () => {
    writeTestFile(`<?xml version="1.0"?>
<resources>
    <string name="greeting">Hello %1$s, you have %2$d messages</string>
</resources>`);
    const entries = parseStringsXml(testFile);
    expect(entries[0].value).toBe("Hello %1$s, you have %2$d messages");
  });
});

// --- parsePluralsXml ---

describe("parsePluralsXml", () => {
  it("parses plural entries", () => {
    writeTestFile(PLURALS_XML);
    const entries = parsePluralsXml(testFile);
    expect(entries).toHaveLength(2);
    expect(entries[0].name).toBe("items_count");
    expect(entries[0].items).toEqual([
      { quantity: "one", value: "%d item" },
      { quantity: "other", value: "%d items" },
    ]);
    expect(entries[1].name).toBe("days");
    expect(entries[1].items).toHaveLength(3);
  });

  it("returns empty for non-existent file", () => {
    expect(parsePluralsXml("/nonexistent/strings.xml")).toEqual([]);
  });

  it("returns empty for file with no plurals", () => {
    writeTestFile(BASIC_XML);
    expect(parsePluralsXml(testFile)).toEqual([]);
  });
});

// --- parseStringArraysXml ---

describe("parseStringArraysXml", () => {
  it("parses string arrays", () => {
    writeTestFile(STRING_ARRAYS_XML);
    const entries = parseStringArraysXml(testFile);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("colors");
    expect(entries[0].items).toEqual(["Red", "Green", "Blue"]);
  });

  it("returns empty for non-existent file", () => {
    expect(parseStringArraysXml("/nonexistent/strings.xml")).toEqual([]);
  });
});

// --- insertStringInXml ---

describe("insertStringInXml", () => {
  it("inserts at end before </resources>", () => {
    writeTestFile(BASIC_XML);
    insertStringInXml(testFile, "new_key", "New Value");
    const entries = parseStringsXml(testFile);
    expect(entries).toHaveLength(4);
    expect(entries[3]).toEqual({ name: "new_key", value: "New Value", translatable: true });
  });

  it("inserts after a specific key", () => {
    writeTestFile(BASIC_XML);
    insertStringInXml(testFile, "greeting", "Hi there", "hello");
    const entries = parseStringsXml(testFile);
    expect(entries).toHaveLength(4);
    expect(entries[1].name).toBe("hello");
    expect(entries[2].name).toBe("greeting");
    expect(entries[3].name).toBe("goodbye");
  });

  it("falls back to end if afterKey not found", () => {
    writeTestFile(BASIC_XML);
    insertStringInXml(testFile, "new_key", "Value", "nonexistent");
    const entries = parseStringsXml(testFile);
    expect(entries).toHaveLength(4);
    expect(entries[3].name).toBe("new_key");
  });

  it("escapes special characters in value", () => {
    writeTestFile(BASIC_XML);
    insertStringInXml(testFile, "special", "Tom & Jerry's \"show\"");
    const content = readTestFile();
    expect(content).toContain("Tom &amp; Jerry\\'s &quot;show&quot;");
  });
});

// --- updateStringInXml ---

describe("updateStringInXml", () => {
  it("updates an existing string", () => {
    writeTestFile(BASIC_XML);
    const result = updateStringInXml(testFile, "hello", "Hola");
    expect(result).toBe(true);
    const entries = parseStringsXml(testFile);
    expect(entries.find((e) => e.name === "hello")?.value).toBe("Hola");
  });

  it("returns false for non-existent key", () => {
    writeTestFile(BASIC_XML);
    const result = updateStringInXml(testFile, "nonexistent", "value");
    expect(result).toBe(false);
  });

  it("preserves other strings", () => {
    writeTestFile(BASIC_XML);
    updateStringInXml(testFile, "hello", "Hola");
    const entries = parseStringsXml(testFile);
    expect(entries).toHaveLength(3);
    expect(entries[0].value).toBe("MyApp");
    expect(entries[2].value).toBe("Goodbye");
  });

  it("escapes new value", () => {
    writeTestFile(BASIC_XML);
    updateStringInXml(testFile, "hello", "A & B");
    const content = readTestFile();
    expect(content).toContain("A &amp; B");
  });
});

// --- deleteStringFromXml ---

describe("deleteStringFromXml", () => {
  it("deletes an existing string", () => {
    writeTestFile(BASIC_XML);
    const result = deleteStringFromXml(testFile, "hello");
    expect(result).toBe(true);
    const entries = parseStringsXml(testFile);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.name)).toEqual(["app_name", "goodbye"]);
  });

  it("returns false for non-existent key", () => {
    writeTestFile(BASIC_XML);
    const result = deleteStringFromXml(testFile, "nonexistent");
    expect(result).toBe(false);
  });

  it("preserves other strings intact", () => {
    writeTestFile(BASIC_XML);
    deleteStringFromXml(testFile, "hello");
    const entries = parseStringsXml(testFile);
    expect(entries[0]).toEqual({ name: "app_name", value: "MyApp", translatable: false });
    expect(entries[1]).toEqual({ name: "goodbye", value: "Goodbye", translatable: true });
  });
});

// --- renameStringInXml ---

describe("renameStringInXml", () => {
  it("renames an existing key", () => {
    writeTestFile(BASIC_XML);
    const result = renameStringInXml(testFile, "hello", "hi");
    expect(result).toBe(true);
    const entries = parseStringsXml(testFile);
    expect(entries.map((e) => e.name)).toEqual(["app_name", "hi", "goodbye"]);
  });

  it("preserves the value", () => {
    writeTestFile(BASIC_XML);
    renameStringInXml(testFile, "hello", "hi");
    const entries = parseStringsXml(testFile);
    expect(entries.find((e) => e.name === "hi")?.value).toBe("Hello");
  });

  it("returns false for non-existent key", () => {
    writeTestFile(BASIC_XML);
    expect(renameStringInXml(testFile, "nonexistent", "new")).toBe(false);
  });

  it("preserves ordering", () => {
    writeTestFile(BASIC_XML);
    renameStringInXml(testFile, "hello", "zzz_last");
    const entries = parseStringsXml(testFile);
    expect(entries[0].name).toBe("app_name");
    expect(entries[1].name).toBe("zzz_last");
    expect(entries[2].name).toBe("goodbye");
  });
});

// --- sortStringsInXml ---

describe("sortStringsInXml", () => {
  it("sorts strings alphabetically", () => {
    writeTestFile(BASIC_XML);
    const moved = sortStringsInXml(testFile);
    expect(moved).toBeGreaterThan(0);
    const entries = parseStringsXml(testFile);
    const names = entries.map((e) => e.name);
    expect(names).toEqual([...names].sort());
  });

  it("returns 0 for already sorted file", () => {
    writeTestFile(`<?xml version="1.0"?>
<resources>
    <string name="aaa">A</string>
    <string name="bbb">B</string>
    <string name="ccc">C</string>
</resources>`);
    expect(sortStringsInXml(testFile)).toBe(0);
  });

  it("returns 0 for single entry", () => {
    writeTestFile(`<?xml version="1.0"?>
<resources>
    <string name="only">Only one</string>
</resources>`);
    expect(sortStringsInXml(testFile)).toBe(0);
  });

  it("preserves values after sorting", () => {
    writeTestFile(`<?xml version="1.0"?>
<resources>
    <string name="zebra">Z value</string>
    <string name="apple">A value</string>
</resources>`);
    sortStringsInXml(testFile);
    const entries = parseStringsXml(testFile);
    expect(entries[0]).toEqual({ name: "apple", value: "A value", translatable: true });
    expect(entries[1]).toEqual({ name: "zebra", value: "Z value", translatable: true });
  });
});

// --- Edge cases ---

describe("edge cases", () => {
  it("handles key names with dots", () => {
    writeTestFile(`<?xml version="1.0"?>
<resources>
    <string name="com.example.key">Value</string>
</resources>`);
    const entries = parseStringsXml(testFile);
    expect(entries[0].name).toBe("com.example.key");

    const updated = updateStringInXml(testFile, "com.example.key", "New");
    expect(updated).toBe(true);

    const deleted = deleteStringFromXml(testFile, "com.example.key");
    expect(deleted).toBe(true);
    expect(parseStringsXml(testFile)).toHaveLength(0);
  });

  it("handles key names with underscores and numbers", () => {
    writeTestFile(`<?xml version="1.0"?>
<resources>
    <string name="btn_save_2">Save 2</string>
</resources>`);
    expect(parseStringsXml(testFile)[0].name).toBe("btn_save_2");
  });

  it("handles empty string value", () => {
    writeTestFile(`<?xml version="1.0"?>
<resources>
    <string name="empty"></string>
</resources>`);
    const entries = parseStringsXml(testFile);
    expect(entries[0].value).toBe("");
  });

  it("insert then update then delete round-trip", () => {
    writeTestFile(`<?xml version="1.0"?>
<resources>
</resources>`);
    insertStringInXml(testFile, "test_key", "original");
    expect(parseStringsXml(testFile)).toHaveLength(1);

    updateStringInXml(testFile, "test_key", "updated");
    expect(parseStringsXml(testFile)[0].value).toBe("updated");

    deleteStringFromXml(testFile, "test_key");
    expect(parseStringsXml(testFile)).toHaveLength(0);
  });
});
