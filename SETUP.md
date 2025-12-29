# Quick Setup Guide

## ⚠️ Required Steps Before Using

### 1. Download InboxSDK (Required)
The `inboxsdk.js` file currently contains only a placeholder. Download the actual library:

```bash
curl -L https://www.inboxsdk.com/build/inboxsdk.js > inboxsdk.js
```

Or open https://www.inboxsdk.com/build/inboxsdk.js in your browser and save as `inboxsdk.js`.

### 2. Add Icon (Required)
Create a 128x128px PNG icon named `icon.png`.

**Quick option**: Download from https://www.flaticon.com/search?word=pen

### 3. Load in Chrome

1. Open `chrome://extensions/` in Chrome
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select this directory: `/Users/manitmishra/Desktop/ghostwriter`

### 4. Configure

1. Click the Ghostwriter icon in Chrome toolbar
2. Enter your Anthropic API key from https://console.anthropic.com
3. Choose your preferred tone
4. Visit Gmail and start ghostwriting!

## Testing Checklist

Once loaded, test these scenarios:

- [ ] Extension appears in `chrome://extensions/`
- [ ] Popup opens when clicking extension icon
- [ ] API key saves successfully
- [ ] Tone selector works
- [ ] Button appears in Gmail compose window (next to Send)
- [ ] Polish mode: Write draft → click Ghostwrite → text improves
- [ ] Generate mode: Open reply → click Ghostwrite (empty) → draft generates
- [ ] All three tones work (Professional, Friendly, Confident)

## Common Issues

**"InboxSDK is not defined"**
→ Download the actual InboxSDK library (step 1 above)

**Button doesn't appear in Gmail**
→ Refresh Gmail after loading extension
→ Check console for errors (`Ctrl+Shift+J` in Gmail)

**"API key not configured"**
→ Click extension icon and save your API key

**Generate mode error**
→ Generate only works in replies with thread context
→ Try polish mode instead (write draft first)

## Need Help?

Check the full README.md for detailed documentation.
