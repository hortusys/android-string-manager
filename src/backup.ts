import * as fs from "fs";

export function createBackup(filePath: string): string {
  const backupPath = filePath + ".bak";
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

export function restoreBackup(filePath: string): void {
  const backupPath = filePath + ".bak";
  if (!fs.existsSync(backupPath)) {
    throw new Error(`No backup found at ${backupPath}`);
  }
  fs.copyFileSync(backupPath, filePath);
  fs.unlinkSync(backupPath);
}

function validateXml(filePath: string): void {
  const content = fs.readFileSync(filePath, "utf-8");
  if (!content.trim()) {
    throw new Error("File is empty after modification");
  }
  if (!content.includes("</resources>")) {
    throw new Error("Missing </resources> closing tag after modification");
  }
}

export function withBackup<T>(filePath: string, operation: () => T): T {
  const backupPath = createBackup(filePath);
  try {
    const result = operation();
    validateXml(filePath);
    // Success — remove backup
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
    return result;
  } catch (err) {
    // Restore from backup
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, filePath);
      fs.unlinkSync(backupPath);
    }
    throw err;
  }
}
