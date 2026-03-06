import * as fs from "fs";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
