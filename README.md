# android-string-manager

MCP server for managing Android string resources (`strings.xml`) across multiple locales. Auto-detects locales from your `res/` directory — works with any Android project.

## Setup

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "android-string-manager": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "android-string-manager"],
      "env": {
        "ANDROID_RES_DIR": "./app/src/main/res"
      }
    }
  }
}
```

Set `ANDROID_RES_DIR` to your project's `res/` directory. The server auto-detects all `values*/strings.xml` files.

## Tools

### Core CRUD

| Tool | Description |
|------|-------------|
| `add_string` | Add a string to selected locales. Supports `afterKey` for positioning. |
| `add_strings` | Bulk add multiple strings in one call. |
| `get_string` | Look up a key across all locales. |
| `update_string` | Update a value in one or more locales. |
| `delete_string` | Remove a key from all locales. |
| `rename_key` | Rename a key across all locales, preserving position and values. |

### Search & Discovery

| Tool | Description |
|------|-------------|
| `search_strings` | Search by key or value with regex support and locale filtering. |
| `list_locales` | Show all detected locales with string, plural, and string-array counts. |
| `list_missing` | Find keys present in some locales but missing in others. |

### Validation & Quality

| Tool | Description |
|------|-------------|
| `validate_placeholders` | Check that `%s`, `%d`, `%1$s` placeholders match across locales. Mismatches cause runtime crashes. |
| `find_duplicates` | Find different keys with identical values — likely copy-paste errors or consolidation opportunities. |

### Organization

| Tool | Description |
|------|-------------|
| `sort_strings` | Alphabetically sort keys in locale files. Reduces merge conflicts. |

### Import / Export

| Tool | Description |
|------|-------------|
| `export_csv` | Export translatable strings to CSV for sending to translators. |
| `import_csv` | Import translations from CSV. Supports dry-run preview. |

### Git Integration

| Tool | Description |
|------|-------------|
| `diff_strings` | Show added, modified, and deleted string keys since a git ref. |

## Locale Convention

- `values/strings.xml` is the `"default"` locale
- `values-ru/strings.xml` is `"ru"`
- `values-pt-rBR/strings.xml` is `"pt-rBR"`

When providing values, use these locale codes:

```json
{
  "default": "Save",
  "ru": "Сохранить",
  "uk": "Зберегти"
}
```

## Development

```bash
npm install
npm run build
ANDROID_RES_DIR=/path/to/res node dist/index.js
```

## License

MIT
