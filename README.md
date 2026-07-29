# Folio

Folio is a small, focused place to capture thoughts without leaving what you are reading. It has two clients:

- a desktop browser side panel with an offline local cache and account-scoped cloud sync
- an installable Android web app that works locally without an account and offers invite-only cloud sync

## What it does

- Opens from the toolbar or `Command+Shift+Y` (`Ctrl+Shift+Y` elsewhere)
- Captures the current page title, URL, and selected text
- Saves plain-text/Markdown notes locally in IndexedDB
- Recognizes inline `#tags`
- Searches, edits, and deletes saved notes
- Exports the complete collection as Markdown or JSON

Folio does not collect full page content. Notes stay local until cloud sync is explicitly connected to a Folio account.

## Desktop cloud sync

Sign in at [folio.warmbeing.com](https://folio.warmbeing.com), open the account menu, and choose **Connect browser extension**. Enter the eight-character code in the extension menu and choose **Connect and sync**. The code expires after ten minutes and can be used once. The first sync merges existing notes from both sides; later saves, edits, and deletions sync automatically. Folio keeps working offline and reconciles changes when the connection returns.

## Android

Open [folio.warmbeing.com](https://folio.warmbeing.com) in Chrome, then choose **Install app** or **Add to Home screen** from Chrome's menu. No account is required for local notes. Once installed, Folio appears in Android's share sheet, so text and links can be sent directly from WeRead or another app.

Captured notes are saved locally first. Connecting Folio Cloud is optional and requires an invitation for a new account. When a user signs in, Folio asks before copying guest notes into the account; the guest copy is only removed after cloud sync succeeds. Connected accounts continue queuing changes offline and sync when the connection returns.

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

Production requires `DATABASE_URL`, `FOLIO_ACCESS_KEY`, `FOLIO_SESSION_SECRET`, `FOLIO_OWNER_EMAIL`, and the SMTP settings shown in `web/.env.example`. `FOLIO_ACCESS_KEY` is the invitation code required only when an email creates its account for the first time. The current deployment uses Vercel and a Neon Postgres database in Singapore.

## Data model

Cloud notes belong to one user and store their text, optional page context, extracted tags, and creation/update timestamps. Device-local guest notes live in a separate IndexedDB scope. Email links create browser sessions; extension pairing codes exchange once for revocable device tokens. Conflicts use the newest update, while deletion markers prevent removed notes from reappearing after an offline sync.
