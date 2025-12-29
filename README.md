# Ghostwriter for Gmail

AI-powered email drafting Chrome extension using Claude Sonnet 4.5 API.

## Features

- **Dual Mode Operation:**
  - **Polish Mode**: Improve and refine existing email drafts
  - **Generate Mode**: Create drafts from scratch using thread context

- **Tone Customization:**
  - Professional (formal, business-appropriate)
  - Friendly (warm, approachable)
  - Confident (assertive, direct)

- **Smart Integration:**
  - Button placed next to Send button for intuitive workflow
  - Automatically detects replies vs new emails
  - Extracts thread context for contextual responses

## Setup Instructions

### 1. Download InboxSDK Library

The InboxSDK library file needs to be downloaded:

```bash
cd /Users/manitmishra/Desktop/ghostwriter
curl -L https://www.inboxsdk.com/build/inboxsdk.js > inboxsdk.js
```

Or visit https://www.inboxsdk.com/build/inboxsdk.js and save as `inboxsdk.js`.

### 2. Add Extension Icon

Create or download a 128x128px PNG icon named `icon.png` and place it in the project directory.

Quick options:
- Download from flaticon.com or icons8.com
- Search for: "pen icon", "email icon", or "quill icon"
- Or use any 128x128px PNG image

### 3. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `/Users/manitmishra/Desktop/ghostwriter` directory
5. The Ghostwriter extension should now appear in your extensions list

### 4. Configure API Key

1. Click the Ghostwriter extension icon in Chrome toolbar
2. Enter your Anthropic API key (get one at https://console.anthropic.com)
3. Click "Save API Key"
4. Select your preferred tone (Professional, Friendly, or Confident)

### 5. Use in Gmail

1. Open Gmail (mail.google.com)
2. Compose a new email or reply to an existing thread
3. Look for the "Ghostwrite" button next to the Send button
4. Click to polish your draft or generate a response!

## How It Works

### Polish Mode (Draft Exists)
1. Write your email draft
2. Click "Ghostwrite"
3. Claude polishes your draft using your selected tone
4. Review and send!

### Generate Mode (Empty Draft)
1. Open a reply to an existing email thread
2. Click "Ghostwrite" without writing anything
3. Claude generates a contextual response based on the thread
4. Edit if needed and send!

## File Structure

```
ghostwriter/
├── manifest.json          # Extension configuration
├── inboxsdk.js           # InboxSDK library (download required)
├── content.js            # Gmail integration logic
├── background.js         # API communication
├── popup.html            # Settings popup UI
├── popup.js              # Settings popup logic
├── popup.css             # Settings popup styling
├── icon.png              # Extension icon (create/download required)
└── README.md             # This file
```

## Technical Details

- **Model**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)
- **Framework**: Manifest V3, InboxSDK
- **AppId**: `sdk_ghostwriter_c73a9a612c`
- **API**: Anthropic Messages API
- **Storage**: chrome.storage.local (API key and tone preference)

## Troubleshooting

### Extension doesn't load
- Ensure InboxSDK library is downloaded
- Check console for errors at `chrome://extensions/`
- Verify manifest.json is valid JSON

### Button doesn't appear in Gmail
- Make sure you're on mail.google.com
- Check browser console for InboxSDK errors
- Try refreshing Gmail
- Ensure InboxSDK is loaded correctly

### API errors
- Verify API key is correct (starts with `sk-ant-`)
- Check API key has credits at console.anthropic.com
- Ensure internet connection is stable
- Check rate limits aren't exceeded

### Generate mode shows error
- Generate mode requires existing thread context
- Try writing a draft instead (polish mode)
- Ensure you're replying to an email, not composing new

## Development

Built following 2025 Chrome Extension best practices:
- Manifest V3 compliance
- InboxSDK for Gmail DOM abstraction
- Minimal permissions (storage only)
- Promise-based async/await patterns
- Comprehensive error handling

## Privacy & Security

- API key stored locally using chrome.storage.local
- No data sent to third parties except Anthropic API
- All code runs locally in the browser
- No telemetry or tracking

## Credits

- Built with [InboxSDK](https://www.inboxsdk.com/)
- Powered by [Claude Sonnet 4.5](https://www.anthropic.com/)
- Follows [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/)

## License

For personal use. Anthropic API terms apply.
# ghostwriter
