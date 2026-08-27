# Folio Chrome Web Store listing

## Package

- Upload: `output/folio-0.4.0-chrome.zip`
- Manifest version: 3
- Version: 0.4.0
- Default locale: English
- Additional locale: Simplified Chinese (`zh_CN`)

## English listing

### Name

Folio

### Summary

Capture thoughts, selected text, and page links in a calm side panel, with local-first storage and optional cloud sync.

### Description

Folio is a quiet place to capture a thought without leaving what you are reading.

Open Folio from the Chrome toolbar or press Command+Shift+Y (Ctrl+Shift+Y on Windows and Linux). The side panel picks up the current page title, URL, and text you deliberately selected, so you can turn the moment into a useful note in seconds.

What you can do:

- Capture notes, selected passages, and source links
- Organize ideas with inline #tags
- Search, edit, and delete notes from the side panel
- Export your complete library as Markdown or JSON
- Keep everything on your device by default
- Optionally connect Folio Cloud for encrypted cross-device sync

Folio does not read complete web pages or monitor browsing in the background. It accesses the current tab only when you open the extension. Cloud sync is optional and begins only after you explicitly connect an account.

English and Simplified Chinese interfaces are included automatically based on your browser language.

## 简体中文商店文案

### 名称

Folio

### 简短说明

在 Chrome 侧边栏随手记录想法、选中文本和网页链接；默认本地保存，可选择连接云端同步。

### 详细说明

Folio 是一个不打断阅读、随手留下想法的安静角落。

点击 Chrome 工具栏中的 Folio，或按 Command+Shift+Y（Windows 和 Linux 为 Ctrl+Shift+Y），即可打开侧边栏。Folio 会读取当前页面的标题、链接，以及你主动选中的文本，让此刻的灵感几秒钟内变成一条有来源的笔记。

你可以：

- 保存笔记、选中文本和来源链接
- 使用行内 #标签 整理想法
- 在侧边栏搜索、编辑和删除笔记
- 将全部笔记导出为 Markdown 或 JSON
- 默认只把笔记保存在当前设备
- 按需连接 Folio Cloud，通过加密连接跨设备同步

Folio 不会读取完整网页，也不会在后台监控浏览行为。只有当你主动打开插件时，它才会访问当前标签页。云同步完全可选，只有在你明确连接账号后才会开始。

插件会根据浏览器语言自动显示英文或简体中文界面。

## Privacy form

### Single purpose

Let users capture and manage notes about the page they are actively viewing from a browser side panel.

### Permission justifications

- `activeTab`: Reads the title and URL of the active page only after the user opens Folio. It does not monitor tabs in the background.
- `scripting`: Reads only the text the user has deliberately selected on the active page, after Folio is opened.
- `sidePanel`: Provides Folio's primary note-taking interface alongside the page being read.
- `storage`: Stores notes, drafts, deletion markers, and the optional revocable cloud device token locally.
- Host access to `https://folio.warmbeing.com/*`: Connects only to Folio's own authentication and synchronization API after the user explicitly enables cloud sync.

### Remote code

No. All executable extension code is included in the uploaded package.

### Data disclosures

Declare the following because Chrome requires disclosure even when data remains local:

- Personally identifiable information: email address, only when the user opts into Folio Cloud
- Authentication information: one-time pairing code and revocable device token for optional cloud sync
- Web history: title and URL of the page the user explicitly captures
- Website content: text the user explicitly selects for a note
- User-generated content: note text and tags

Data is used for the extension's single purpose, is not used for advertising or credit decisions, and is not sold. Cloud data is processed by Vercel, Neon, and the configured email delivery provider solely to operate Folio.

### Privacy policy

https://folio.warmbeing.com/privacy

## Distribution

- Visibility: Public
- Pricing: Free
- Regions: All regions supported by Chrome Web Store
- Mature content: No

## Test instructions

Core functionality does not require an account:

1. Open any ordinary `https://` page and select a short passage.
2. Click the Folio toolbar icon. The side panel should show the page title, URL, and selected passage.
3. Enter a note with a `#tag`, then click Save.
4. Search for the note, edit it, and export the library as Markdown or JSON from the menu.
5. Cloud sync is optional. If reviewers need to test it, provide a temporary invitation code in the private reviewer notes; reviewers can use their own accessible email address for the magic-link sign-in.

## Assets

- Extension icon: bundled `icons/128.png`
- English screenshot: `chrome-store/assets/screenshot-en-1280x800.png`
- Simplified Chinese screenshot: `chrome-store/assets/screenshot-zh-CN-1280x800.png`
- Small promotional tile: `chrome-store/assets/promo-small-440x280.png`
