# ASCII Animals New Tab

ASCII animals drift across your new tab, behind a Dia-style search box with suggestions from your history and Google.

A new-tab extension for Dia, other Chromium browsers, Firefox and Zen, built on [ascii-animals](https://github.com/DesignerStephen1/ascii-animals) by DesignerStephen1.

![demo img](https://i.ibb.co/Q307LWd6/image.png)

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

Download the right zip from this repository's [Releases](../../releases):

| Browser | Download |
|---|---|
| Dia, Chrome, Edge, Arc, Brave and other Chromium browsers | `chrome-extension-universal.zip` |
| Firefox and Zen | [addons.mozilla.org/en-US/firefox/addon/ascii-animals-new-tab-page](https://addons.mozilla.org/en-US/firefox/addon/ascii-animals-new-tab-page/) or download directly from [addons.mozilla.org/firefox/downloads/file/5282856/a668bd87586d4cd9b37d-1.21.1.xpi](https://addons.mozilla.org/firefox/downloads/file/5282856/a668bd87586d4cd9b37d-1.21.1.xpi) |

### Dia, Chrome and other Chromium browsers

1. Unzip `chrome-extension-universal.zip` into a folder you'll keep. The browser loads the extension from that folder, so don't delete it.
2. Go to `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the folder.
4. Open a new tab.
5. Double-click the name to put your own name in the greeting.

To update, unzip the new version over the same folder and click reload ↻ on the extension in `chrome://extensions`.

### Firefox and Zen

Download extension here: [addons.mozilla.org/firefox/downloads/file/5282856/a668bd87586d4cd9b37d-1.21.1.xpi](https://addons.mozilla.org/firefox/downloads/file/5282856/a668bd87586d4cd9b37d-1.21.1.xpi)

## How it works in each browser

- **Dia:** Dia doesn't let extensions replace its new tab, which opens at `chrome://start-page/…`. A small background script watches for that page and sends the tab to the animals page instead. It stays awake so this happens as fast as possible.
- **Chrome and other Chromium browsers** that allow extensions to replace the new tab use the page directly.
- **Firefox and Zen** also use the page directly. They normally put the cursor in the address bar when a new tab opens, so a background script loads each new tab's page again at `index.html?focus`, which moves the cursor into the page's search box.

## Known limitations

- **Dia:** a brief flash of Dia's own new tab when you press Cmd+T, because the extension can only redirect the tab after Dia has started loading it. The Option+T shortcut avoids this.
- **The address bar shows the extension's address** (`chrome-extension://…` or `moz-extension://…`). Browsers always show an extension page's real address and don't let extensions hide it.
- **Doesn't work in incognito or private windows.**
  
## Permissions

| Permission | Why |
|---|---|
| `tabs` | To spot new tabs: in Dia to redirect them to the animals page, in Firefox and Zen to move the cursor into the page |
| `history` | For history suggestions, searched on your own computer only |
| `favicon` (Chromium only) | To show site icons next to history suggestions |
| `search` | To search with your default search engine |
| `suggestqueries.google.com` | To fetch Google's search suggestions. What you type is sent to Google, as it is in any browser's address bar |

In Firefox and Zen, site icons next to history suggestions come from Google's icon service, which sees the site names of your suggestions. Firefox doesn't give extensions the icons it has saved.

Nothing else leaves your computer. Your settings are saved in the browser's local storage.

## Building from source

Needs Node.js 22 and npm 10.

```sh
npm ci
npm run build:chrome    # → dist-chrome/   (Dia, Chrome, Edge, Arc…)
npm run build:firefox   # → dist-firefox/  (Firefox, Zen)
npm run build           # both
```

Load `dist-chrome/` as an unpacked extension, or `dist-firefox/` as a temporary add-on in Firefox. Vite bundles and minifies the TypeScript, CSS and fonts into `assets/`. Everything else is copied as it is.

Both versions share the same page. The Chromium build uses `public/manifest.json` and `public/background.js`. The Firefox build swaps in `firefox/manifest.json` and `firefox/background.js`.

**For Mozilla's review:** `npm ci` installs the exact versions in `package-lock.json`, so `npm ci && npm run build:firefox` rebuilds the submitted add-on byte for byte in `dist-firefox/`.

### Releases

Pushing a version tag builds both zips and attaches them, along with the source code, to a GitHub Release (see `.github/workflows/release.yml`):

```sh
git tag v1.24.0
git push origin v1.24.0
```

Bump `version` in both `public/manifest.json` and `firefox/manifest.json` first. You can also run the workflow by hand from the **Actions** tab, which makes the zips available to download from that run.

### Files added on top of the original project

- `public/manifest.json`: the Chromium manifest
- `public/background.js`: the Dia new tab redirect, keep-awake and shortcut
- `public/liquid.js`: the browser check, moved out of `index.html` because extensions don't allow inline scripts
- `public/icons/`: the extension icon (an original pixel butterfly), and `icon-source/` with the script that draws it
- `firefox/manifest.json`: the Firefox manifest
- `firefox/background.js`: moves the cursor from the address bar into the page in Firefox and Zen
- `suggest.ts`: history and Google suggestions, inline fill-in, URL detection and search
- `scripts/build.mjs`: builds either version
- `.github/workflows/release.yml`: builds both versions and publishes a release

## Credits

- Animals, engine and page design: [ascii-animals](https://github.com/DesignerStephen1/ascii-animals) by DesignerStephen1, MIT licence
- Engine and renderer originally from [ascii-sharks](https://github.com/stackedlol/ascii-sharks)
- The Dia logo and search box style come from the original project's design concept. This extension isn't affiliated with Dia, The Browser Company or Zen.

GNU licence: see `LICENSE`.
