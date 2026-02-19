# Ghostwriter for Gmail

A Chrome extension that integrates Claude Sonnet 4.5 directly into Gmail's compose UI to draft and polish emails without leaving the browser.

## Features

- **Polish mode** — rewrites your rough draft into a ready-to-send email
- **Generate mode** — generates a reply from scratch using thread context when the compose window is empty
- **Copy Thread** — copies the full email thread as Markdown to the clipboard
- **Two tones** — Regular (professional/everyday) and Bitcamp (hackathon sponsorship outreach)

## Setup

See [SETUP.md](SETUP.md) for full install instructions.

```bash
npm install
npm run build
```

## Usage

1. Open Gmail and start composing or replying to an email
2. Click the **Ghostwrite** button next to the Send button
   - If you've typed a draft, it will be polished
   - If the compose window is empty (reply), a draft will be generated from the thread
3. Switch tones from the extension popup

## Architecture

The extension is built on Chrome Manifest V3 with three components:

- **Content script** (`src/content/content.js`) — integrates with Gmail via [InboxSDK](https://www.inboxsdk.com/), extracts thread context from the DOM, and handles UI interactions
- **Background service worker** (`src/background/background.js`) — handles Anthropic API calls and assembles prompts via tone modules in `src/background/prompts/`
- **Popup** (`src/popup/`) — settings UI for API key and tone selection, persisted in `chrome.storage.local`