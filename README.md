# ASCII Animals New Tab

ASCII animals drift across your new tab, behind a Dia-style search box with suggestions from your history and Google.

A new-tab extension for Dia and other Chromium browsers, built on [ascii-animals](https://github.com/DesignerStephen1/ascii-animals) by DesignerStephen1.

## What's on the page

- **Seven animals to choose from:** butterflies, koi, jellyfish, dragonflies, frogs, cranes and crabs. Each one moves in its own way, and the ones farther away look smaller, move slower and fade into the background.
- **Click** near the animals to startle them, or tap the koi pond to drop food.
- **The animal picker** (top centre) and **Tweaks** (top right) stay hidden until your mouse moves near them. Tweaks lets you adjust speed, number of animals, colours and more, with settings saved for each animal.
- **A greeting** that changes with the time of day. **Double-click it to change your name** (press Enter to save, Esc to cancel). Leave the name empty for no name.
- **A search box**:
  - It shows **suggestions as you type**: pages from your history (addresses that start with what you've typed come first, then the ones you visit most) and Google's search suggestions.
  - **The top suggestion is filled in as you type.** Typing `gi` fills in `github.com`, with the added part selected. Keep typing to replace it, press **Enter** to open it, **→ / Tab** to accept the text, or **Backspace / Esc** to remove it.
  - Use **↑ / ↓** to pick a suggestion and **Enter** to open it, or click one. **Esc** closes the list.
  - **Enter** on a web address (for example `github.com`) opens the site. Anything else is searched with your browser's default search engine.

## Install

0. Go to releases for this repository and download `chrome-extension-universal.zip`
1. Unzip the file into a folder you'll keep. The browser loads the extension from that folder, so don't delete it.
2. Go to `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the folder.
4. Open a new tab.
5. Click the name twice to input your own name for the greeting.

## How it works in Dia

For Dia, a small background script watches for that page and sends the tab to the animals page instead. It stays awake so this happens as fast as possible.
In Chrome and other browsers that do allow extensions to replace the new tab, the page is used directly.

## Known limitations

- **A brief flash of Dia's own new tab** when you press Cmd+T, because the extension can only redirect the tab after Dia has started loading it. The Option+T shortcut avoids this.
- **The address bar shows `chrome-extension://…/index.html`.** Browsers always show an extension page's real address and don't let extensions hide it.
- **Doesn't work in incognito windows.**

## Permissions

| Permission | Why |
|---|---|
| `tabs` | To spot Dia's new tab and redirect it to the animals page |
| `history` | For history suggestions, searched on your own computer only |
| `favicon` | To show site icons next to history suggestions |
| `search` | To search with your default search engine |
| `suggestqueries.google.com` | To fetch Google's search suggestions. What you type is sent to Google, as it is in any browser's address bar |

Nothing else leaves your computer. Your settings are saved in the browser's local storage.

## Building from source

```sh
npm install
npx vite build --base=./ --outDir dist --emptyOutDir
cp LICENSE dist/
```

Then load `dist/` as an unpacked extension. `public/manifest.json` and `public/background.js` are copied into the build as they are.

Files added on top of the original project:

- `public/manifest.json`: the extension manifest
- `public/background.js`: the new tab redirect, keep-awake and shortcut
- `public/liquid.js`: the browser check, moved out of `index.html` because extensions don't allow inline scripts
- `suggest.ts`: history and Google suggestions, URL detection and search

## Credits

- Animals, engine and page design: [ascii-animals](https://github.com/DesignerStephen1/ascii-animals) by DesignerStephen1, MIT licence
- Engine and renderer originally from [ascii-sharks](https://github.com/stackedlol/ascii-sharks)
- The Dia logo and search box style come from the original project's design concept. This extension isn't affiliated with Dia or The Browser Company.

MIT licence: see `LICENSE`.
