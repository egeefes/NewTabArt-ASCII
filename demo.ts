// Fonts bundled locally instead of Google Fonts, so the new tab doesn't wait on the network.
import "@fontsource/geist-sans/latin-400.css";
import "@fontsource/geist-sans/latin-500.css";
import "@fontsource/geist-mono/latin-600.css";
import { mountTweakPanel, type Control, type ControlKit } from "./panel";
import { ANIMAL_KEYS, ANIMALS, AnimalEngine, SHARED_CONTROLS, type AnimalKey, type KnobSpec, type Tuning } from "./src";
import { mountChoices, mountComposer, mountGreeting } from "./ui";
import { looksLikeUrl, mountSuggestions, search, toUrl } from "./suggest";

/**
 * Prefix for everything this app keeps in localStorage. It shares a domain with the older
 * butterflies app (Pocket Studio, /butterflies-app), which uses bare "tweaks" and "animal".
 */
const STORE = "ascii-animals:";

const params = new URLSearchParams(location.search);

// ?animal=koi picks the animal (otherwise the last one picked); ?count=60 pins how many. No count: sized to the screen.
const count = Number(params.get("count")) || undefined;
const isAnimal = (key: string | null): key is AnimalKey => key !== null && key in ANIMALS;
let saved: string | null = null;
try {
  saved = localStorage.getItem(STORE + "animal");
} catch {
  // Storage unavailable: start with butterflies.
}
let animal: AnimalKey = isAnimal(params.get("animal")) ? (params.get("animal") as AnimalKey) : isAnimal(saved) ? saved : "butterflies";

// Dark mode only: every animal is tuned to glow on black.
const engine = new AnimalEngine(document.querySelector("canvas")!, { animal, count, theme: "dark" });

// ── tweak panel: shared Movement and Look knobs around the animal's own ──

/** Each animal's tweaks are saved under their own key. */
const storageKey = (key: AnimalKey) => `${STORE}tweaks:${key}`;

function controlsFor(key: AnimalKey) {
  const a = ANIMALS[key];
  const hidden = new Set<string>(a.hide ?? []);
  return (kit: ControlKit<Tuning>): [string, Control[]][] => {
    const build = (spec: KnobSpec): Control => {
      if ("toggle" in spec) return kit.toggle(spec.key, spec.label, spec.hint);
      const knob = kit.knob(spec.key, spec.label, spec.min, spec.max, spec.step, spec.hint);
      const when = spec.disabledWhen;
      return when ? { ...knob, disabled: () => Boolean(engine.tuning[when]) } : knob;
    };
    const keep = (specs: KnobSpec[]) => specs.filter((s) => !hidden.has(s.key)).map(build);
    return [
      ["Movement", keep(SHARED_CONTROLS.movement)],
      ...a.controls.map(([title, specs]): [string, Control[]] => [title, specs.map(build)]),
      ["Look", keep(SHARED_CONTROLS.look)],
    ];
  };
}

let tweaks = mountTweakPanel(engine, ANIMALS[animal].defaults, controlsFor(animal), { storageKey: storageKey(animal) });

// Open in two tabs? When the other one saves tweaks for this animal, reload, so this tab never
// writes its stale settings back over the newer ones.
window.addEventListener("storage", (e) => {
  if (e.key === storageKey(animal)) location.reload();
});

// ── animal choices: every animal in the top bar, each with a dot of its own colour ──

mountChoices(
  document.querySelector<HTMLElement>(".choices")!,
  ANIMAL_KEYS.map((key) => ({ value: key, label: ANIMALS[key].label, swatch: `rgb(${ANIMALS[key].swatch.join(",")})` })),
  animal,
  (value) => {
    animal = value as AnimalKey;
    engine.setAnimal(animal);
    tweaks.destroy();
    tweaks = mountTweakPanel(engine, ANIMALS[animal].defaults, controlsFor(animal), { storageKey: storageKey(animal) });
    try {
      localStorage.setItem(STORE + "animal", animal);
    } catch {
      // Not remembered across visits, that's all.
    }
  },
);

mountComposer();
mountGreeting("Ege");

mountSuggestions();

// Pin the box's top edge where it first lands, so suggestions grow it downward instead of
// re-centering it (which made it jump up and down).
{
  const stage = document.querySelector<HTMLElement>(".stage")!;
  const pin = () => {
    stage.style.top = "";
    stage.style.translate = "";
    const r = stage.getBoundingClientRect();
    stage.style.top = `${r.top}px`;
    stage.style.translate = "-50% 0";
  };
  document.fonts.ready.then(pin);
  addEventListener("resize", pin);
}

// New-tab extension: Enter opens an address if you typed one, otherwise searches with the default engine.
document.querySelector(".composer")!.addEventListener("chat:submit", (e) => {
  const text = (e as CustomEvent<{ text: string }>).detail.text;
  if (looksLikeUrl(text)) location.href = toUrl(text);
  else search(text);
});
