import * as fs from "fs";

// --- Types ---

export interface StringEntry {
  name: string;
  value: string;
  translatable: boolean;
}

export interface PluralEntry {
  name: string;
  items: { quantity: string; value: string }[];
}

export interface StringArrayEntry {
  name: string;
  items: string[];
}

// --- Escaping ---

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "\\'");
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- Parsing ---

export function parseStringsXml(filePath: string): StringEntry[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8");
  const entries: StringEntry[] = [];
  const regex = /<string\s+name="([^"]+)"(\s+translatable="false")?[^>]*>([\s\S]*?)<\/string>/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    entries.push({
      name: match[1],
      value: match[3],
      translatable: !match[2],
    });
  }
  return entries;
}

export function parsePluralsXml(filePath: string): PluralEntry[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8");
  const entries: PluralEntry[] = [];
  const pluralRegex = /<plurals\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/plurals>/g;
  const itemRegex = /<item\s+quantity="([^"]+)"[^>]*>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = pluralRegex.exec(content)) !== null) {
    const items: { quantity: string; value: string }[] = [];
    let itemMatch;
    while ((itemMatch = itemRegex.exec(match[2])) !== null) {
      items.push({ quantity: itemMatch[1], value: itemMatch[2] });
    }
    entries.push({ name: match[1], items });
  }
  return entries;
}

export function parseStringArraysXml(filePath: string): StringArrayEntry[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8");
  const entries: StringArrayEntry[] = [];
  const arrayRegex = /<string-array\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/string-array>/g;
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = arrayRegex.exec(content)) !== null) {
    const items: string[] = [];
    let itemMatch;
    while ((itemMatch = itemRegex.exec(match[2])) !== null) {
      items.push(itemMatch[1]);
    }
    entries.push({ name: match[1], items });
  }
  return entries;
}

// --- Modification ---

export function insertStringInXml(
  filePath: string,
  name: string,
  value: string,
  afterKey?: string
): void {
  let content = fs.readFileSync(filePath, "utf-8");
  const newLine = `    <string name="${name}">${escapeXml(value)}</string>`;

  if (afterKey) {
    const afterRegex = new RegExp(
      `(<string\\s+name="${escapeRegex(afterKey)}"[^>]*>[\\s\\S]*?<\\/string>)`
    );
    if (afterRegex.test(content)) {
      content = content.replace(afterRegex, `$1\n${newLine}`);
      fs.writeFileSync(filePath, content, "utf-8");
      return;
    }
  }

  const closingTag = "</resources>";
  content = content.replace(closingTag, newLine + "\n" + closingTag);
  fs.writeFileSync(filePath, content, "utf-8");
}

export function updateStringInXml(filePath: string, name: string, newValue: string): boolean {
  let content = fs.readFileSync(filePath, "utf-8");
  const regex = new RegExp(
    `(<string\\s+name="${escapeRegex(name)}"[^>]*>)[\\s\\S]*?(<\\/string>)`
  );
  if (!regex.test(content)) return false;
  content = content.replace(regex, `$1${escapeXml(newValue)}$2`);
  fs.writeFileSync(filePath, content, "utf-8");
  return true;
}

export function deleteStringFromXml(filePath: string, name: string): boolean {
  let content = fs.readFileSync(filePath, "utf-8");
  const regex = new RegExp(
    `\\s*<string\\s+name="${escapeRegex(name)}"[^>]*>[\\s\\S]*?<\\/string>`,
    "g"
  );
  const newContent = content.replace(regex, "");
  if (newContent === content) return false;
  fs.writeFileSync(filePath, newContent, "utf-8");
  return true;
}

export function renameStringInXml(filePath: string, oldName: string, newName: string): boolean {
  let content = fs.readFileSync(filePath, "utf-8");
  const regex = new RegExp(
    `(<string\\s+name=")${escapeRegex(oldName)}("[^>]*>)`
  );
  if (!regex.test(content)) return false;
  content = content.replace(regex, `$1${newName}$2`);
  fs.writeFileSync(filePath, content, "utf-8");
  return true;
}

export function sortStringsInXml(filePath: string): number {
  const content = fs.readFileSync(filePath, "utf-8");

  const stringRegex = /( *<string\s+name="([^"]+)"[^>]*>[\s\S]*?<\/string>)/g;
  const entries: { full: string; name: string }[] = [];
  let match;
  while ((match = stringRegex.exec(content)) !== null) {
    entries.push({ full: match[1], name: match[2] });
  }

  if (entries.length <= 1) return 0;

  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));

  let swaps = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].name !== sorted[i].name) swaps++;
  }
  if (swaps === 0) return 0;

  let result = content;
  for (let i = 0; i < entries.length; i++) {
    result = result.replace(entries[i].full, `__PLACEHOLDER_${i}__`);
  }
  for (let i = 0; i < sorted.length; i++) {
    result = result.replace(`__PLACEHOLDER_${i}__`, sorted[i].full);
  }

  fs.writeFileSync(filePath, result, "utf-8");
  return swaps;
}

// --- Plural modification ---

export function insertPluralInXml(
  filePath: string,
  name: string,
  items: { quantity: string; value: string }[]
): void {
  let content = fs.readFileSync(filePath, "utf-8");
  const itemLines = items
    .map((item) => `        <item quantity="${item.quantity}">${escapeXml(item.value)}</item>`)
    .join("\n");
  const block = `    <plurals name="${name}">\n${itemLines}\n    </plurals>`;
  const closingTag = "</resources>";
  content = content.replace(closingTag, block + "\n" + closingTag);
  fs.writeFileSync(filePath, content, "utf-8");
}

export function updatePluralInXml(
  filePath: string,
  name: string,
  items: { quantity: string; value: string }[]
): boolean {
  let content = fs.readFileSync(filePath, "utf-8");
  const regex = new RegExp(
    `(<plurals\\s+name="${escapeRegex(name)}"[^>]*>)[\\s\\S]*?(<\\/plurals>)`
  );
  if (!regex.test(content)) return false;
  const itemLines = items
    .map((item) => `        <item quantity="${item.quantity}">${escapeXml(item.value)}</item>`)
    .join("\n");
  content = content.replace(regex, `$1\n${itemLines}\n    $2`);
  fs.writeFileSync(filePath, content, "utf-8");
  return true;
}

export function deletePluralFromXml(filePath: string, name: string): boolean {
  let content = fs.readFileSync(filePath, "utf-8");
  const regex = new RegExp(
    `\\s*<plurals\\s+name="${escapeRegex(name)}"[^>]*>[\\s\\S]*?<\\/plurals>`,
    "g"
  );
  const newContent = content.replace(regex, "");
  if (newContent === content) return false;
  fs.writeFileSync(filePath, newContent, "utf-8");
  return true;
}

// --- String-array modification ---

export function insertStringArrayInXml(
  filePath: string,
  name: string,
  items: string[]
): void {
  let content = fs.readFileSync(filePath, "utf-8");
  const itemLines = items
    .map((item) => `        <item>${escapeXml(item)}</item>`)
    .join("\n");
  const block = `    <string-array name="${name}">\n${itemLines}\n    </string-array>`;
  const closingTag = "</resources>";
  content = content.replace(closingTag, block + "\n" + closingTag);
  fs.writeFileSync(filePath, content, "utf-8");
}

export function updateStringArrayInXml(
  filePath: string,
  name: string,
  items: string[]
): boolean {
  let content = fs.readFileSync(filePath, "utf-8");
  const regex = new RegExp(
    `(<string-array\\s+name="${escapeRegex(name)}"[^>]*>)[\\s\\S]*?(<\\/string-array>)`
  );
  if (!regex.test(content)) return false;
  const itemLines = items
    .map((item) => `        <item>${escapeXml(item)}</item>`)
    .join("\n");
  content = content.replace(regex, `$1\n${itemLines}\n    $2`);
  fs.writeFileSync(filePath, content, "utf-8");
  return true;
}

export function deleteStringArrayFromXml(filePath: string, name: string): boolean {
  let content = fs.readFileSync(filePath, "utf-8");
  const regex = new RegExp(
    `\\s*<string-array\\s+name="${escapeRegex(name)}"[^>]*>[\\s\\S]*?<\\/string-array>`,
    "g"
  );
  const newContent = content.replace(regex, "");
  if (newContent === content) return false;
  fs.writeFileSync(filePath, newContent, "utf-8");
  return true;
}

// --- Format string placeholders ---

export function extractPlaceholders(value: string): string[] {
  const regex = /%(\d+\$)?[sdfc]/g;
  const placeholders: string[] = [];
  let match;
  while ((match = regex.exec(value)) !== null) {
    placeholders.push(match[0]);
  }
  return placeholders.sort();
}
