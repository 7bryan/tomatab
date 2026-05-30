# Tomatab — Browser Extension

A cross-browser Pomodoro timer extension for Chrome, Brave, and Firefox.

## Features

- 25 minute focus timer with customizable work/break durations
- Alarm sound when timer ends
- In-popup overlay notification when session completes
- Badge indicator on extension icon
- OS notification when popup is closed
- Runs in the background even when popup is closed
- Task input to track what you're working on

## Browser Support

| Browser | Supported |
|---------|-----------|
| Chrome  | ✓ |
| Brave   | ✓ |
| Firefox | ✓ |

## Setup

### Prerequisites
- [Node.js](https://nodejs.org/) v14 or higher
- npm

### Install & Build

```bash
git clone https://github.com/7bryan/tomatab.git
cd tomatab
npm install
npm run build
```

### Load in Chrome / Brave

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `tomatab/` folder

### Load in Firefox

1. Go to `about:debugging`
2. Click **This Firefox**
3. Click **Load Temporary Add-on**
4. Select the `manifest.json` file inside the `tomatab/` folder

## Development

```bash
npm run watch
```

This auto-compiles TypeScript on every save. After saving, just hit the refresh icon on `chrome://extensions` to reload the extension.

## Project Structure

```
tomatab/
├── src/
│   ├── background.ts   # background service worker, alarms, notifications
│   ├── popup.ts        # popup UI logic
│   ├── offscreen.ts    # audio playback context
│   └── style.css       # styles   
├── dist/               # compiled output (auto-generated, not in git)
├── icon.png
├── manifest.json
├── popup.html
├── package.json
└── tsconfig.json
```

## Tech Stack

- TypeScript
- Tailwind CSS
- WebExtension API (chrome.*)
