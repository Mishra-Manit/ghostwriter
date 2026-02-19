# Setup

## Prerequisites

- Node.js (for building)
- Anthropic API key from [console.anthropic.com](https://console.anthropic.com)

## Install and Build

```bash
npm install
npm run build
```

## Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this directory
4. Click the Ghostwriter icon in the toolbar
5. Enter your Anthropic API key and save

## Development

Use watch mode to auto-rebuild on file changes:

```bash
npm run dev
```

Then reload the extension at `chrome://extensions/` after each rebuild.

## Testing Checklist

- [ ] Extension appears in `chrome://extensions/` with no errors
- [ ] Popup opens and accepts API key
- [ ] Ghostwrite button appears in Gmail compose window (next to Send)
- [ ] **Polish mode**: write a draft, click Ghostwrite — text improves
- [ ] **Generate mode**: open a reply with no draft, click Ghostwrite — reply generates from thread context
- [ ] Both tones work (Regular, Bitcamp)
- [ ] Copy Thread button appears in thread toolbar and copies Markdown to clipboard
