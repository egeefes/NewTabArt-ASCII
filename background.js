// Dia ignores chrome_url_overrides, so catch its new tab page and point it at ours.
// Dia's new tab is chrome://start-page/<id>; the others cover plain Chromium-style new tabs.
const PAGE = chrome.runtime.getURL("index.html");
const NEW_TAB = /^[a-z-]+:\/\/(start-page|newtab|new-tab-page|new-tab)\b/i;
const go = (id) => chrome.tabs.update(id, { url: PAGE }).catch(() => {});

// Only Dia's actual new tab page is redirected. (An earlier "blank tab" shortcut also caught links
// opened in a new tab, since those start out blank too, so it's gone.)
chrome.tabs.onCreated.addListener((tab) => {
  const url = tab.pendingUrl || tab.url;
  if (url && NEW_TAB.test(url)) go(tab.id);
});
chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.url && NEW_TAB.test(change.url)) go(id);
});

// Keep this script awake: Chromium puts idle extensions to sleep after ~30s, and waking up
// is most of the delay before a redirect. Any extension call every 20s resets the timer.
setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
chrome.runtime.onStartup.addListener(() => {});

// Shortcut that opens the animals page straight away, with no Dia start page at all.
chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === "open-animals") chrome.tabs.create({ url: PAGE });
});
