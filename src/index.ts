#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerAddString, registerAddStrings } from "./tools/add-string.js";
import { registerGetString } from "./tools/get-string.js";
import { registerUpdateString } from "./tools/update-string.js";
import { registerDeleteString } from "./tools/delete-string.js";
import { registerSearchStrings } from "./tools/search-strings.js";
import { registerListLocales } from "./tools/list-locales.js";
import { registerRenameKey } from "./tools/rename-key.js";
import { registerListMissing } from "./tools/list-missing.js";
import { registerSortStrings } from "./tools/sort-strings.js";
import { registerValidatePlaceholders } from "./tools/validate-placeholders.js";
import { registerFindDuplicates } from "./tools/find-duplicates.js";
import { registerExportCsv, registerImportCsv } from "./tools/export-csv.js";
import { registerGitDiff } from "./tools/git-diff.js";
import { registerAddPlural, registerUpdatePlural, registerDeletePlural } from "./tools/plurals.js";
import { registerAddStringArray, registerUpdateStringArray, registerDeleteStringArray } from "./tools/string-arrays.js";
import { registerFindUnusedKeys, registerTranslationStats, registerLintStrings } from "./tools/analysis.js";
import { registerResources } from "./resources.js";
import { getResDirs } from "./locales.js";

const server = new McpServer({
  name: "android-string-manager",
  version: "2.3.0",
});

// Core CRUD
registerAddString(server);
registerAddStrings(server);
registerGetString(server);
registerUpdateString(server);
registerDeleteString(server);
registerRenameKey(server);

// Plurals CRUD
registerAddPlural(server);
registerUpdatePlural(server);
registerDeletePlural(server);

// String-array CRUD
registerAddStringArray(server);
registerUpdateStringArray(server);
registerDeleteStringArray(server);

// Search & discovery
registerSearchStrings(server);
registerListLocales(server);
registerListMissing(server);

// Validation & quality
registerValidatePlaceholders(server);
registerFindDuplicates(server);

// Organization
registerSortStrings(server);

// Import/Export
registerExportCsv(server);
registerImportCsv(server);

// Analysis & DX
registerFindUnusedKeys(server);
registerTranslationStats(server);
registerLintStrings(server);

// Git integration
registerGitDiff(server);

// Resources
registerResources(server, getResDirs());

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("android-string-manager MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
