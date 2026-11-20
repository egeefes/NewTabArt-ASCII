// Firefox and Zen put the cursor in the address bar whenever a new tab opens, so typing goes there
// instead of into the page's search box. Workaround: as each new tab shows our page, load it again at a
// slightly different address (index.html?focus), replacing the history entry. Firefox keeps the address
// bar focused for the new tab's own address, but hands the cursor to an ordinary page.
//
// This runs in the background rather than in the page because Firefox preloads the next new tab page out
// of sight; a fix inside the page runs too early there and never runs again once the tab appears.
const api = typeof browser !== "undefined" ? browser : chrome;
const PAGE = api.runtime.getURL("index.html");
const FOCUSED = PAGE + "?focus";
const handled = new Set();

function isOurNewTab(url) {
  return url === PAGE || url === "about:newtab";
}

function move(tabId, url) {
  if (!isOurNewTab(url) || handled.has(tabId)) return;
  handled.add(tabId);
  api.tabs.update(tabId, { url: FOCUSED, loadReplace: true }).catch(() => handled.delete(tabId));
}

api.tabs.onCreated.addListener((tab) => move(tab.id, tab.url));
api.tabs.onUpdated.addListener((id, change, tab) => move(id, change.url || tab.url));
api.tabs.onRemoved.addListener((id) => handled.delete(id));
