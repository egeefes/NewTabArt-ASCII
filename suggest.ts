/**
 * Address-bar-style suggestions for the new tab's search box: pages from your history
 * (most visited first) and Google's search suggestions. Arrow keys / mouse to pick, Enter to open.
 */
const c = (globalThis as any).chrome;

type Item = { kind: "url"; url: string; title: string } | { kind: "search"; text: string };

export function looksLikeUrl(q: string) {
  return !/\s/.test(q) && (/^[a-z][\w+.-]*:\/\//i.test(q) || /^(localhost|[\w-]+(\.[\w-]+)*\.[a-z]{2,})(:\d+)?(\/\S*)?$/i.test(q));
}
export const toUrl = (q: string) => (/^[a-z][\w+.-]*:\/\//i.test(q) ? q : "https://" + q);

export function search(text: string) {
  if (c?.search?.query) c.search.query({ text, disposition: "CURRENT_TAB" });
  else location.href = "https://www.google.com/search?q=" + encodeURIComponent(text);
}

// History is loaded once when the page opens and then filtered in memory, so each keystroke is instant.
type Visit = { url: string; title: string; typed: number; visits: number; last: number };
let historyCache: Visit[] = [];
// Loaded just after the page has drawn (or as soon as you type), so it doesn't slow the first frame.
let historyLoad: Promise<void> | null = null;
function loadHistory(): Promise<void> {
  return (historyLoad ??= (async () => {
    if (!c?.history?.search) return;
    const results: any[] = await c.history.search({ text: "", startTime: Date.now() - 365 * 864e5, maxResults: 5000 });
    historyCache = results
      .filter((r) => /^https?:/.test(r.url))
      .map((r) => ({ url: r.url, title: r.title || "", typed: r.typedCount || 0, visits: r.visitCount || 0, last: r.lastVisitTime || 0 }));
  })().catch(() => {}));
}
const idle = (globalThis as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200));
requestAnimationFrame(() => idle(() => loadHistory(), { timeout: 500 }));

const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "");

function fromHistory(q: string): Item[] {
  const lq = q.toLowerCase();
  const words = lq.split(/\s+/).filter(Boolean);
  const scored: { v: Visit; score: number }[] = [];
  for (const v of historyCache) {
    const h = host(v.url).toLowerCase();
    const t = v.title.toLowerCase();
    if (!words.every((w) => h.includes(w) || t.includes(w))) continue;
    // Addresses starting with what you typed first, then how often you type/visit them.
    const score = (h.startsWith(lq) ? 1000 : 0) + v.typed * 5 + v.visits + (h.split("/")[0].length < 30 ? 2 : 0);
    scored.push({ v, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ v }) => ({ kind: "url", url: v.url, title: v.title || host(v.url) }));
}

let inflight: AbortController | null = null;
async function fromGoogle(q: string): Promise<Item[]> {
  inflight?.abort();
  inflight = new AbortController();
  try {
    const res = await fetch("https://suggestqueries.google.com/complete/search?client=chrome&q=" + encodeURIComponent(q), { signal: inflight.signal });
    const data = await res.json();
    return (data[1] as string[]).slice(0, 5).map((text) => ({ kind: "search", text }));
  } catch {
    return [];
  }
}

const display = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

/**
 * The best history address that starts with what you typed, for filling in the box.
 * Without a "/" in what you typed it completes to a whole site (github.com), like an address bar.
 */
function inlineFromHistory(q: string): Item | null {
  const lq = q.toLowerCase();
  if (/\s/.test(lq)) return null;
  const sites = new Map<string, { url: string; score: number }>();
  for (const v of historyCache) {
    const d = display(v.url).toLowerCase();
    if (!d.startsWith(lq)) continue;
    let key = d;
    let url = v.url;
    if (!lq.includes("/")) {
      key = d.split("/")[0];
      try {
        url = new URL(v.url).origin + "/";
      } catch {}
    }
    const prev = sites.get(key);
    const score = (prev?.score || 0) + v.typed * 5 + v.visits;
    sites.set(key, { url: prev && prev.url.length <= url.length ? prev.url : url, score });
  }
  let best: { key: string; url: string; score: number } | null = null;
  for (const [key, v] of sites) if (!best || v.score > best.score) best = { key, ...v };
  return best ? { kind: "url", url: best.url, title: best.key } : null;
}

const favicon = (url: string) =>
  c?.runtime?.getURL ? `${c.runtime.getURL("/_favicon/")}?pageUrl=${encodeURIComponent(url)}&size=32` : "";
const SEARCH_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>`;
const GLOBE_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>`;

export function mountSuggestions() {
  const form = document.querySelector<HTMLFormElement>(".composer")!;
  const prompt = form.querySelector("textarea")!;
  const list = document.createElement("ul");
  list.className = "suggestions";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  form.querySelector(".composer-field")!.after(list);

  let items: Item[] = [];
  let sel = -1;
  let seq = 0;
  // What you actually typed. The box can hold more: the first suggestion filled in and selected.
  let typed = "";
  let fill = ""; // the full filled-in text, or "" when nothing is filled in
  let deleting = false; // don't fill in again right after Backspace/Delete

  const open = (item: Item) => (item.kind === "url" ? (location.href = item.url) : search(item.text));
  const fillText = (item: Item) => (item.kind === "url" ? display(item.url) : item.text);

  function render() {
    list.innerHTML = "";
    list.hidden = items.length === 0;
    items.forEach((item, i) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.className = i === sel ? "on" : "";
      const icon = document.createElement("span");
      icon.className = "s-icon";
      if (item.kind === "url") {
        const img = new Image();
        img.src = favicon(item.url);
        img.onerror = () => (icon.innerHTML = GLOBE_ICON);
        icon.append(img);
      } else icon.innerHTML = SEARCH_ICON;
      const main = document.createElement("span");
      main.className = "s-main";
      main.textContent = item.kind === "url" ? item.title : item.text;
      li.append(icon, main);
      if (item.kind === "url") {
        const sub = document.createElement("span");
        sub.className = "s-sub";
        sub.textContent = display(item.url);
        li.append(sub);
      }
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        open(item);
      });
      li.addEventListener("mousemove", () => {
        if (sel !== i) (sel = i), render();
      });
      list.append(li);
    });
  }

  /** Put the rest of `text` after what you typed, selected, so the next key you press replaces it. */
  function applyFill(text: string) {
    if (!text || text.length <= typed.length || !text.toLowerCase().startsWith(typed.toLowerCase())) return clearFill();
    fill = typed + text.slice(typed.length);
    prompt.value = fill;
    prompt.setSelectionRange(typed.length, fill.length, "backward");
  }
  function clearFill() {
    if (fill && prompt.value === fill) prompt.value = typed;
    fill = "";
  }

  function compose(q: string, sugg: Item[]) {
    const out: Item[] = [];
    // First suggestion: the site you most likely mean, if it starts with what you typed.
    const inline = deleting ? null : inlineFromHistory(q);
    if (inline) out.push(inline);
    if (looksLikeUrl(q) && !out.some((o) => o.kind === "url" && display(o.url) === display(toUrl(q))))
      out.push({ kind: "url", url: toUrl(q), title: q });
    for (const h of fromHistory(q)) if (h.kind === "url" && !out.some((o) => o.kind === "url" && o.url === h.url)) out.push(h);
    for (const s of sugg) if (s.kind === "search" && s.text.toLowerCase() !== q.toLowerCase()) out.push(s);
    items = out.slice(0, 8);
    sel = -1;
    // Fill in the first suggestion if it continues what you typed (and you're still typing at the end).
    const first = items[0];
    const atEnd = prompt.selectionEnd === prompt.value.length;
    if (!deleting && first && atEnd && fillText(first).toLowerCase().startsWith(q.toLowerCase())) {
      applyFill(fillText(first));
      if (fill) sel = 0;
    } else clearFill();
    render();
  }

  function update() {
    const q = typed;
    const my = ++seq;
    if (!q.trim()) {
      items = [];
      clearFill();
      return render();
    }
    const fallback = setTimeout(() => my === seq && items.length === 0 && compose(q, []), 600);
    Promise.all([loadHistory(), fromGoogle(q.trim())]).then(([, sugg]) => {
      clearTimeout(fallback);
      if (my === seq && prompt.value.startsWith(typed)) compose(q, sugg);
    });
  }

  let timer = 0;
  prompt.addEventListener("beforeinput", (e) => {
    deleting = e.inputType.startsWith("delete");
  });
  prompt.addEventListener("input", () => {
    typed = prompt.value;
    fill = "";
    // If you typed the next letter of what was filled in, keep the fill straight away (no flicker).
    const first = items[0];
    if (!deleting && first && sel === 0 && fillText(first).toLowerCase().startsWith(typed.toLowerCase())) {
      applyFill(fillText(first));
    } else if (sel === 0) sel = -1;
    render();
    clearTimeout(timer);
    if (!typed.trim()) return update();
    timer = window.setTimeout(update, 100);
  });

  // Capture phase, so Enter on a picked or filled-in suggestion opens it instead of sending the box.
  prompt.addEventListener(
    "keydown",
    (e) => {
      if (list.hidden) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = items.length;
        sel = e.key === "ArrowDown" ? (sel + 1) % n : sel <= 0 ? n - 1 : sel - 1;
        if (fill) clearFill(), prompt.setSelectionRange(typed.length, typed.length);
        render();
      } else if (e.key === "Enter" && !e.shiftKey && !e.isComposing && sel >= 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        open(items[sel]);
      } else if (e.key === "Escape") {
        if (fill) {
          clearFill();
          sel = -1;
          render();
        } else {
          items = [];
          render();
        }
      } else if ((e.key === "ArrowRight" || e.key === "End" || e.key === "Tab") && fill) {
        // Accept the filled-in text as typed.
        if (e.key === "Tab") e.preventDefault();
        typed = fill;
        fill = "";
        prompt.setSelectionRange(typed.length, typed.length);
      }
    },
    true,
  );
  prompt.addEventListener("blur", () =>
    setTimeout(() => {
      clearFill();
      items = [];
      render();
    }, 100),
  );
  prompt.addEventListener("focus", () => {
    typed = prompt.value;
    update();
  });
}
