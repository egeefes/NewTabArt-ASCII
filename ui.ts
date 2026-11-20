/**
 * Page chrome shared by every scene: glass segmented choices and the chat composer.
 */
/** A greeting by the local time: "Good morning, Ege" … "Still up, Ege?" after 10pm. No name, no comma. */
export function greetingFor(name: string, date = new Date()) {
  const h = date.getHours();
  const n = name ? `, ${name}` : "";
  if (h >= 5 && h < 12) return `Good morning${n}`;
  if (h >= 12 && h < 17) return `Good afternoon${n}`;
  if (h >= 17 && h < 22) return `Good evening${n}`;
  return `Still up${n}?`;
}

const NAME_KEY = "ascii-animals:name";

/** Greet by the time of day and keep it current. Double-click the greeting to change the name. */
export function mountGreeting(fallback: string) {
  const el = document.querySelector<HTMLElement>(".greeting");
  if (!el) return;
  let name = fallback;
  try {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved !== null) name = saved;
  } catch {}
  let editing = false;
  const update = () => {
    if (!editing) el.textContent = greetingFor(name);
  };
  update();
  setInterval(update, 60_000);

  el.title = "Double-click to change your name";
  el.addEventListener("dblclick", () => {
    if (editing) return;
    editing = true;
    const input = document.createElement("input");
    input.className = "greeting-input";
    input.value = name;
    input.placeholder = "Your name";
    input.maxLength = 40;
    input.setAttribute("aria-label", "Your name");
    el.textContent = "";
    el.append(input);
    input.focus();
    input.select();
    const done = (save: boolean) => {
      if (!editing) return;
      editing = false;
      if (save) {
        name = input.value.trim();
        try {
          localStorage.setItem(NAME_KEY, name);
        } catch {}
      }
      update();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") (e.preventDefault(), done(true));
      else if (e.key === "Escape") done(false);
    });
    input.addEventListener("blur", () => done(true));
  });
}

/** UI only: a submit fires a `chat:submit` event on the form for whatever backend gets wired up. */
export function mountComposer() {
  const form = document.querySelector<HTMLFormElement>(".composer")!;
  const prompt = form.querySelector("textarea")!;
  const send = form.querySelector<HTMLButtonElement>(".send")!;

  function fit() {
    prompt.style.height = "auto";
    prompt.style.height = `${prompt.scrollHeight}px`;
    // Scroll only once it hits its max height; below that it just grows.
    prompt.style.overflowY = prompt.scrollHeight > prompt.clientHeight + 1 ? "auto" : "hidden";
    send.disabled = prompt.value.trim() === "";
  }

  prompt.addEventListener("input", fit);
  // Ready to type on load where there's a mouse; on a phone that would throw the keyboard up.
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) prompt.focus({ preventScroll: true });
  prompt.addEventListener("keydown", (e) => {
    // Enter sends, Shift+Enter is a newline; leave Enter alone mid-IME composition.
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = prompt.value.trim();
    if (!text) return;
    form.dispatchEvent(new CustomEvent("chat:submit", { detail: { text } }));
    prompt.value = "";
    fit();
  });
}

export interface Choice {
  value: string;
  label: string;
  /** CSS colour for a dot before the label; none if left out. */
  swatch?: string;
}

/**
 * A glass segmented control in `host` (a radiogroup): every choice in a row, with a thumb that slides
 * under the current one. Arrow keys move between them; the row scrolls sideways if it doesn't fit.
 */
export function mountChoices(host: HTMLElement, choices: Choice[], current: string, onPick: (value: string) => void) {
  const thumb = document.createElement("span");
  thumb.className = "thumb";
  thumb.setAttribute("aria-hidden", "true");
  host.append(thumb);

  const buttons = choices.map((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.dataset.value = c.value;
    if (c.swatch) {
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.setProperty("--swatch", c.swatch);
      dot.setAttribute("aria-hidden", "true");
      b.append(dot);
    }
    const label = document.createElement("span");
    label.textContent = c.label;
    b.append(label);
    b.addEventListener("click", () => select(c.value, true));
    host.append(b);
    return b;
  });

  function place() {
    const b = buttons.find((x) => x.getAttribute("aria-checked") === "true");
    if (!b) return;
    thumb.style.translate = `${b.offsetLeft}px 0`;
    thumb.style.width = `${b.offsetWidth}px`;
  }

  function select(value: string, pick: boolean) {
    for (const b of buttons) {
      const on = b.dataset.value === value;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on) b.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    place();
    if (pick) onPick(value);
  }

  host.addEventListener("keydown", (e) => {
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0 || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
    e.preventDefault();
    const next = buttons[(at + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length];
    next.focus();
    select(next.dataset.value!, true);
  });

  select(current, false);
  // Labels change width once the webfont arrives, and when the window resizes.
  document.fonts?.ready.then(place);
  window.addEventListener("resize", place);
}
