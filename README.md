# Folio

Folio is a small browser side panel for capturing thoughts without leaving the page you are reading.

## What it does

- Opens from the toolbar or `Command+Shift+Y` (`Ctrl+Shift+Y` elsewhere)
- Captures the current page title, URL, and selected text
- Saves plain-text/Markdown notes locally in IndexedDB
- Recognizes inline `#tags`
- Searches, edits, and deletes saved notes
- Exports the complete collection as Markdown or JSON

Folio does not collect full page content, use a remote service, or send notes anywhere.

## Development

```bash
bun install
bun run dev
```

WXT opens a development browser with the unpacked extension installed. For a production build:

```bash
bun run check
bun test
bun run build
```

The Chrome build is written to `output/chrome-mv3/`.

## Data model

Each note stores its text, optional page context, extracted tags, and creation/update timestamps. Data remains in the extension's IndexedDB until the user deletes it or uninstalls the extension. Use the export menu for backups.
