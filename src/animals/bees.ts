/**
 * Honeybees, buzzing along the course.
 *
 * Seen from above: a black head with feelers, a fuzzy golden thorax, a
 * striped abdomen ending in a sting, and two pairs of clear wings that flicker
 * back and forth with every beat. They fly in quick little jinks (a new
 * heading every fraction of a second), with a bob, and now and then hang in
 * the air for a moment before buzzing on. They leave a faint trail of pollen.
 *
 * A tap plants a flower full of nectar. Bees within Nectar range that aren't
 * full fly over, each to its own spot around the centre, and hover there
 * sipping; the nectar runs down as they drink and the flower wilts once it's
 * empty or old. A bee that has had its fill heads off along the course and
 * ignores flowers for a while.
 */
import { SHARED_TUNING, type Animal, type Creature, type Flock } from "../flock";
import { INK_BODY, INK_DARK, INK_GLOW, INK_SCALE, INK_SHIMMER, INK_SPOT, ink, type RGB } from "../ink";
import { angleDiff, clamp, hash3, lerp, rand, smoothstep, TAU } from "../math";
import type { Pen } from "../renderer";

interface Bee extends Creature {
  /** Wingbeat phase. */
  phase: number;
  mode: "fly" | "hover" | "seek" | "sip";
  /** When the current jink, hover or sip ends. */
  until: number;
  /** Heading offset of the current jink, radians. */
  jink: number;
  /** Ignores flowers until this time (it's full). */
  fullUntil: number;
  /** The flower it's heading to or sipping from. */
  flower: Flower | null;
  /** Its spot around that flower: angle, and distance as a fraction of the flower's size. */
  spotAngle: number;
  spotDist: number;
}

/** A flower planted by a tap. */
interface Flower {
  x: number;
  y: number;
  /** Radius, px. */
  size: number;
  born: number;
  /** Nectar left, 1 → 0. */
  nectar: number;
  /** When it ran dry (or got too old), and started to wilt; 0 while it's fresh. */
  wilted: number;
  /** Petal colour. */
  petal: RGB;
  /** Turn of the petals, radians. */
  turn: number;
  petals: number;
  seed: number;
}

const DEFAULTS = {
  ...SHARED_TUNING,
  density: 1.3,
  speed: 1,
  sway: 0.08,
  spread: 0.12,
  size: 1,
  farthest: 0.3,
  farBias: 1.4,
  grip: 3,
  separation: 500,
  trail: 1.2,
  trailFade: 0.5,
  shimmer: 0.25,
  sparkle: 0.06,
  buzz: 1,
  hover: 1,
  nectarRange: 280,
};

const BLACK: RGB = [30, 26, 22];
const YELLOW: RGB = [250, 196, 40];
const FUZZ: RGB = [214, 150, 52];
const WING: RGB = [214, 232, 255];
const NECTAR: RGB = [255, 176, 32];
// No yellow petals: the bees would vanish against them.
const PETALS: RGB[] = [
  [248, 132, 186], // pink
  [244, 240, 255], // white
  [182, 150, 255], // lavender
  [255, 106, 92], // coral
];
/** How long a flower lasts if nobody empties it, s. */
const FLOWER_LIFE = 22;
/** How long wilting takes, s. */
const WILT = 2.5;
/** Most bees one flower feeds at once. */
const SEATS = 6;

const gardens = new WeakMap<Flock<Bee>, Flower[]>();
const garden = (flock: Flock<Bee>) => {
  let flowers = gardens.get(flock);
  if (!flowers) gardens.set(flock, (flowers = []));
  return flowers;
};

/** How many bees are already on their way to, or sipping at, each flower. */
const visitors = new Map<Flower, number>();

/** The nearest flower with nectar and a free seat within `range` px, if any. */
function nearestFlower(b: Bee, flock: Flock<Bee>, range: number) {
  let best: Flower | null = null;
  let bestD = range;
  for (const f of garden(flock)) {
    if (f.wilted || f.nectar <= 0 || (visitors.get(f) ?? 0) >= SEATS) continue;
    const d = Math.hypot(f.x - b.x, f.y - b.y);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

/** Where this bee hovers while sipping: its own spot around the centre. */
const spot = { x: 0, y: 0 };
function spotFor(b: Bee, f: Flower) {
  spot.x = f.x + Math.cos(b.spotAngle) * f.size * b.spotDist;
  spot.y = f.y + Math.sin(b.spotAngle) * f.size * b.spotDist;
  return spot;
}

function leave(b: Bee, flock: Flock<Bee>) {
  b.flower = null;
  b.mode = "fly";
  b.until = flock.time + rand(0.2, 0.6);
  b.fullUntil = flock.time + rand(8, 14);
}

export const bees: Animal<Bee> = {
  key: "bees",
  label: "Bee",
  swatch: [255, 150, 0],
  defaults: DEFAULTS,
  controls: [
    ["Flight", [
      { key: "buzz", label: "Buzz", min: 0, max: 3, step: 0.05, hint: "How jittery their flight is: how often and how sharply they jink about." },
      { key: "hover", label: "Hover", min: 0, max: 3, step: 0.05, hint: "How often they stop and hang in the air for a moment." },
    ]],
    ["Feeding", [
      { key: "nectarRange", label: "Nectar range", min: 0, max: 600, step: 10, hint: "How close a bee has to be to notice a flower you plant. Click to plant one." },
    ]],
  ],
  area: 52000,
  max: 160,
  scale: 0.72,
  speed: 95,
  trail: { light: [214, 150, 30], dark: [246, 190, 60] },

  create: (c) => ({
    ...c,
    phase: rand(0, TAU),
    mode: "fly",
    until: 0,
    jink: 0,
    fullUntil: 0,
    flower: null,
    spotAngle: 0,
    spotDist: 0,
  }),

  enter(b) {
    b.mode = "fly";
    b.flower = null;
    b.jink = 0;
  },

  /** Flowers age and wilt; count who's visiting each so they don't get mobbed. */
  prepare(flock) {
    const t = flock.time;
    const flowers = garden(flock);
    for (const f of flowers) if (!f.wilted && (f.nectar <= 0 || t - f.born > FLOWER_LIFE)) f.wilted = t;
    for (let i = flowers.length - 1; i >= 0; i--) if (flowers[i].wilted && t - flowers[i].wilted > WILT) flowers.splice(i, 1);
    visitors.clear();
    for (const b of flock.creatures) {
      if (b.flower && (b.flower.wilted || !flowers.includes(b.flower))) leave(b, flock);
      if (b.flower) visitors.set(b.flower, (visitors.get(b.flower) ?? 0) + 1);
    }
  },

  /** A tap plants a flower full of nectar. */
  tap(x, y, flock) {
    const flowers = garden(flock);
    flowers.push({
      x,
      y,
      size: clamp(flock.base * 0.55, 42, 80),
      born: flock.time,
      nectar: 1,
      wilted: 0,
      petal: PETALS[Math.floor(Math.random() * PETALS.length)],
      turn: rand(0, TAU),
      petals: Math.random() < 0.5 ? 5 : 6,
      seed: Math.random() * 100,
    });
    flock.events.push({ x, y, radius: 3, amount: 0.6 });
    if (flowers.length > 8) flowers.splice(0, flowers.length - 8);
  },

  update(b, flock, dt) {
    const k = flock.tuning as typeof DEFAULTS;
    const t = flock.time;
    const cruise = flock.cruise(b);
    b.phase += dt * TAU * 9;

    // Spot a flower? Fly over to a seat of its own around the centre.
    if (!b.flower && t > b.fullUntil && k.nectarRange > 0) {
      const f = nearestFlower(b, flock, k.nectarRange * (0.6 + 0.4 * b.depth));
      if (f) {
        b.flower = f;
        b.mode = "seek";
        b.spotAngle = rand(0, TAU);
        b.spotDist = rand(0.25, 0.75);
        visitors.set(f, (visitors.get(f) ?? 0) + 1);
      }
    }

    const acc = flock.begin();
    if (b.flower) {
      const f = b.flower;
      const s = spotFor(b, f);
      const dx = s.x - b.x;
      const dy = s.y - b.y;
      const d = Math.hypot(dx, dy);
      if (b.mode === "seek") {
        // Fly in fast, slowing as it arrives.
        flock.steer(b, Math.atan2(dy, dx), Math.min(cruise * 2, d * 3 + 10), 6);
        if (d < 5) {
          b.mode = "sip";
          b.until = t + rand(2.5, 5);
        }
        flock.move(b, dt, cruise * 2.2);
        flock.face(b, dt, 12);
      } else {
        // Sipping: hang over the spot with a tiny tremble, facing the centre, drinking.
        b.x = lerp(b.x, s.x + Math.sin(t * 23 + b.id) * 1.2, Math.min(1, dt * 8));
        b.y = lerp(b.y, s.y + Math.cos(t * 19 + b.id * 2) * 1.2, Math.min(1, dt * 8));
        b.vx = 0;
        b.vy = 0;
        flock.face(b, dt, 6, Math.atan2(f.y - b.y, f.x - b.x));
        f.nectar -= dt * 0.045;
        // Wander to another spot on the same flower now and then.
        if (Math.random() < dt * 0.25) {
          b.spotAngle += rand(-1, 1);
          b.spotDist = rand(0.25, 0.75);
          b.mode = "seek";
        }
        if (t > b.until || f.nectar <= 0) {
          leave(b, flock);
          // Off it goes, along the course, dusted with pollen.
          b.vx = Math.cos(flock.heading) * cruise * 1.4;
          b.vy = Math.sin(flock.heading) * cruise * 1.4;
          flock.events.push({ x: b.x, y: b.y, radius: 1, amount: 0.5 });
        }
      }
      if (flock.passed(b, b.span * 4)) flock.reenter(b);
      return;
    }

    // Free flight: quick jinks off the course, a bob, and the odd hover.
    if (t > b.until) {
      if (b.mode === "fly" && Math.random() < 0.18 * k.hover) {
        b.mode = "hover";
        b.until = t + rand(0.4, 1.6);
      } else {
        b.mode = "fly";
        b.jink = rand(-0.9, 0.9) * Math.min(1.5, k.buzz);
        b.until = t + rand(0.15, 0.7) / Math.max(0.3, k.buzz);
      }
    }
    if (b.mode === "hover") {
      // Hang in the air, drifting a touch.
      flock.steer(b, b.heading + Math.sin(t * 7 + b.id) * 1.5, cruise * 0.08, 5);
    } else {
      flock.steer(b, flock.heading + b.bias * k.spread + b.jink, cruise, k.grip + 2 * k.buzz);
      // A bob across the direction of travel.
      const bob = Math.sin(t * 11 + b.id * 1.3) * cruise * 1.6 * k.buzz;
      acc.x += -Math.sin(b.heading) * bob;
      acc.y += Math.cos(b.heading) * bob;
    }
    flock.separate(b);
    const speed = flock.move(b, dt, cruise * 2);
    if (flock.passed(b)) flock.reenter(b);
    if (speed > 8) flock.face(b, dt, 10);
  },

  drawAll(flock, pen) {
    // Flowers first, so the bees sipping at them draw on top.
    for (const f of garden(flock)) drawFlower(f, pen, flock);
    for (const b of flock.creatures) drawBee(b, pen);
  },
};

/** A flower from above: rounded petals around a nectar-gold centre that shrinks as it's drunk. */
function drawFlower(f: Flower, pen: Pen, flock: Flock<Bee>) {
  const t = flock.time;
  const grow = smoothstep(0, 0.45, t - f.born);
  const wilt = f.wilted ? clamp((t - f.wilted) / WILT, 0, 1) : 0;
  const R = f.size * grow * (1 - 0.35 * wilt);
  if (R < 2) return;
  const out = pen.ink;
  const pose = { x: f.x, y: f.y, heading: f.turn + wilt * 0.3, span: R, depth: 1, id: Math.round(f.seed) };
  const centre = 0.2 + 0.14 * f.nectar;
  pen.shape(pose, 1.05, (u, v) => {
    const r = Math.hypot(u, v);
    const a = Math.atan2(v, u);
    if (r < centre) {
      // The nectar: brighter and fuller while there's plenty.
      const fresh = f.nectar > 0.05;
      return fresh
        ? ink(out, NECTAR[0], NECTAR[1] - 30 * (r / centre), NECTAR[2], r < centre * 0.55 ? INK_SPOT : INK_SHIMMER, "o*.")
        : ink(out, 150, 110, 50, INK_DARK, ".:");
    }
    // Petals: a rounded lobe per petal, curling in as it wilts.
    const lobe = Math.abs(Math.cos((a * f.petals) / 2));
    const edge = (0.55 + 0.45 * Math.pow(lobe, 0.6)) * (1 - 0.25 * wilt * (1 - lobe));
    if (r > edge) return false;
    const [pr, pg, pb] = f.petal;
    const shade = 0.78 + 0.22 * (r / edge) - 0.25 * (1 - lobe);
    // Fine veins toward the centre.
    if (r < edge * 0.7 && hash3(Math.round(a * 18), 3, f.seed) > 0.8) return ink(out, pr * 0.8, pg * 0.8, pb * 0.8, INK_DARK, "'");
    return ink(out, pr * shade, pg * shade, pb * shade, INK_SCALE);
  }, { fog: wilt * 0.85, light: 1 - 0.3 * wilt });
}

/** A honeybee from above. */
function drawBee(b: Bee, pen: Pen) {
  const S = b.span;
  const out = pen.ink;
  const pose = { x: b.x, y: b.y, heading: b.heading, span: S, depth: b.depth, id: b.id };
  // Wings sweep forward and back with each beat; sipping bees beat more softly.
  const beat = Math.sin(b.phase);
  const sweep = (b.mode === "sip" ? 0.25 : 0.45) * beat;
  const minBody = pen.cw * 0.45;

  pen.shape(pose, 0.62, (u, v) => {
    const av = Math.abs(v);
    // Head: black, round.
    if (inEllipse(u, av, 0.31, 0, 0.08, 0.1)) return ink(out, ...BLACK, INK_DARK);
    // Thorax: fuzzy gold.
    if (inEllipse(u, av, 0.15, 0, 0.11, Math.max(0.12, minBody / S))) return ink(out, ...FUZZ, INK_BODY);
    // Abdomen: yellow and black bands, a dark tip with the sting.
    if (inEllipse(u, av, -0.13, 0, 0.22, Math.max(0.15, minBody / S))) {
      const band = Math.floor((0.12 - u) / 0.075);
      if (u < -0.3) return ink(out, ...BLACK, INK_DARK);
      return band % 2 === 1 ? ink(out, ...BLACK, INK_DARK) : ink(out, ...YELLOW, INK_SCALE);
    }
    if (u < -0.35 && u > -0.42 && av < 0.015) return ink(out, ...BLACK, INK_DARK, "'");
    // Wings: fore and hind, from the thorax, swept back and flickering.
    if (inWing(u, av, 0.17, 0.06, 0.55 + sweep, 0.36, 0.1) || inWing(u, av, 0.1, 0.06, 0.95 + sweep * 0.8, 0.24, 0.075)) {
      // Bare glyphs, no block: clear wings that let the body and background show.
      return ink(out, ...WING, INK_GLOW, beat > 0 ? "~-" : "=~");
    }
    return false;
  }, { light: 0.95 + 0.05 * beat, tilt: beat * 0.6 });

  // Feelers, bent forward.
  if (S > pen.cw * 2.2) {
    for (const side of [-1, 1]) pen.lineBody(pose, 0.36, 0.03 * side, 0.5, 0.13 * side, BLACK);
  }
  // A faint trail of pollen.
  pen.shed(b.x, b.y, (b.mode === "sip" ? 0.02 : 0.012) * b.depth);
}

function inEllipse(u: number, v: number, cu: number, cv: number, a: number, b: number) {
  const x = (u - cu) / a;
  const y = (v - cv) / b;
  return x * x + y * y <= 1;
}

/**
 * Inside a wing rooted at (ru, rv), pointing out sideways and swept back by `back` radians,
 * `len` long and `wide` across (fractions of span)? v is already folded to one side.
 */
function inWing(u: number, v: number, ru: number, rv: number, back: number, len: number, wide: number) {
  const du = u - ru;
  const dv = v - rv;
  // The wing's axis: out to the side (+v), turned back (−u) by `back`.
  const au = -Math.sin(back);
  const avx = Math.cos(back);
  const along = du * au + dv * avx;
  const across = -du * avx + dv * au;
  if (along < 0) return false;
  const x = (along - len / 2) / (len / 2);
  const y = across / wide;
  return x * x + y * y <= 1;
}
