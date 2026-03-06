import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createBackup, restoreBackup, withBackup } from "../backup.js";

let tmpDir: string;
let testFile: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asm-backup-test-"));
  testFile = path.join(tmpDir, "strings.xml");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const SAMPLE = `<?xml version="1.0"?>
<resources>
    <string name="hello">Hello</string>
</resources>`;

describe("createBackup", () => {
  it("creates a .bak file alongside original", () => {
    fs.writeFileSync(testFile, SAMPLE, "utf-8");
    const backupPath = createBackup(testFile);
    expect(backupPath).toBe(testFile + ".bak");
    expect(fs.existsSync(backupPath)).toBe(true);
    expect(fs.readFileSync(backupPath, "utf-8")).toBe(SAMPLE);
  });

  it("overwrites existing backup", () => {
    fs.writeFileSync(testFile, SAMPLE, "utf-8");
    fs.writeFileSync(testFile + ".bak", "old backup", "utf-8");
    createBackup(testFile);
    expect(fs.readFileSync(testFile + ".bak", "utf-8")).toBe(SAMPLE);
  });
});

describe("restoreBackup", () => {
  it("restores file from backup", () => {
    fs.writeFileSync(testFile, "corrupted", "utf-8");
    fs.writeFileSync(testFile + ".bak", SAMPLE, "utf-8");
    restoreBackup(testFile);
    expect(fs.readFileSync(testFile, "utf-8")).toBe(SAMPLE);
  });

  it("removes backup file after restore", () => {
    fs.writeFileSync(testFile, "corrupted", "utf-8");
    fs.writeFileSync(testFile + ".bak", SAMPLE, "utf-8");
    restoreBackup(testFile);
    expect(fs.existsSync(testFile + ".bak")).toBe(false);
  });

  it("throws if no backup exists", () => {
    fs.writeFileSync(testFile, "data", "utf-8");
    expect(() => restoreBackup(testFile)).toThrow();
  });
});

describe("withBackup", () => {
  it("keeps changes when operation succeeds", () => {
    fs.writeFileSync(testFile, SAMPLE, "utf-8");
    withBackup(testFile, () => {
      fs.writeFileSync(testFile, SAMPLE.replace("Hello", "Hola"), "utf-8");
    });
    expect(fs.readFileSync(testFile, "utf-8")).toContain("Hola");
    // Backup should be cleaned up on success
    expect(fs.existsSync(testFile + ".bak")).toBe(false);
  });

  it("restores original when operation throws", () => {
    fs.writeFileSync(testFile, SAMPLE, "utf-8");
    expect(() =>
      withBackup(testFile, () => {
        fs.writeFileSync(testFile, "GARBAGE", "utf-8");
        throw new Error("oops");
      })
    ).toThrow("oops");
    expect(fs.readFileSync(testFile, "utf-8")).toBe(SAMPLE);
    expect(fs.existsSync(testFile + ".bak")).toBe(false);
  });

  it("restores original when file is left empty", () => {
    fs.writeFileSync(testFile, SAMPLE, "utf-8");
    expect(() =>
      withBackup(testFile, () => {
        fs.writeFileSync(testFile, "", "utf-8");
      })
    ).toThrow();
    expect(fs.readFileSync(testFile, "utf-8")).toBe(SAMPLE);
  });

  it("restores original when closing resources tag is missing", () => {
    fs.writeFileSync(testFile, SAMPLE, "utf-8");
    expect(() =>
      withBackup(testFile, () => {
        fs.writeFileSync(testFile, "<resources><string name='a'>b</string>", "utf-8");
      })
    ).toThrow();
    expect(fs.readFileSync(testFile, "utf-8")).toBe(SAMPLE);
  });

  it("returns the value from the operation", () => {
    fs.writeFileSync(testFile, SAMPLE, "utf-8");
    const result = withBackup(testFile, () => {
      return 42;
    });
    expect(result).toBe(42);
  });
});
