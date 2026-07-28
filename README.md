# Folio

Folio is a small, focused place to capture thoughts without leaving what you are reading. It has two clients:

- a desktop browser side panel with an offline local cache and optional cloud sync
- an installable Android web app that syncs notes through a private cloud store

## What it does

- Opens from the toolbar or `Command+Shift+Y` (`Ctrl+Shift+Y` elsewhere)
- Captures the current page title, URL, and selected text
- Saves plain-text/Markdown notes locally in IndexedDB
- Recognizes inline `#tags`
- Searches, edits, and deletes saved notes
- Exports the complete collection as Markdown or JSON

Folio does not collect full page content. Notes stay local until cloud sync is explicitly connected with your private Folio access code.

## Desktop cloud sync

Open the extension menu, enter the same access code used by the web app, and choose **Connect and sync**. The first sync merges existing notes from both sides; later saves, edits, and deletions sync automatically. Folio keeps working offline and reconciles changes when the connection returns.

## Android

Open [folio.warmbeing.com](https://folio.warmbeing.com) in Chrome, sign in, then choose **Install app** or **Add to Home screen** from Chrome's menu. Once installed, Folio appears in Android's share sheet, so text and links can be sent directly from WeRead or another app.

Captured notes are saved locally first. If the phone is offline, Folio queues them and syncs automatically when the connection returns.

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

The Android PWA lives in `web/` and is an independent Next.js app:

```bash
cd web
bun install
cp .env.example .env.local
bun run check
bun test
bun run dev
```

Production requires `DATABASE_URL`, `FOLIO_ACCESS_KEY`, and `FOLIO_SESSION_SECRET`. The current deployment uses Vercel and a Neon Postgres database in Singapore.

## Data model

Each note stores its text, optional page context, extracted tags, and creation/update timestamps. The extension and Android app both keep local IndexedDB caches and synchronize to Postgres. Conflicts use the newest update, while deletion markers prevent removed notes from reappearing after an offline sync.
