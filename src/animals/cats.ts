/**
 * Cats, padding along the course.
 *
 * Seen from above: an oval body on four small paws, a round head with two
 * pointed ears, and a long tail that swishes in a slow S. Each cat has its own
 * coat: ginger tabby, grey tabby, black, white, or calico. They stroll, and
 * every so often sit down for a while, tail curling and flicking, before
 * strolling on.
 *
 * A tap drops a ball of yarn. Cats within Yarn range crouch and stalk toward
 * it, ears flat, then pounce and bat it away. The ball rolls off, unravelling a
 * strand of yarn behind it and getting smaller, and they chase it and bat it
 * again. Once it's all unwound the game's over: they sit and swish their tails,
 * then wander off. The strand fades a little later.
 */
import { SHARED_TUNING, type Animal, type Creature, type Flock } from "../flock";
import { INK_SCALE, ink, type Ink, type RGB } from "../ink";
import { clamp, frac, rand, TAU } from "../math";
import type { Pen } from "../renderer";
import { inEllipse, spotted, toSegment } from "./shapes";

interface Coat {
  body: RGB;
  /** Stripes or patches. */
  mark: RGB;
  /** A second patch colour (calico), or null. */
  mark2: RGB | null;
  pattern: "tabby" | "patches" | "plain";
  eyes: RGB;
}

const COATS: Coat[] = [
  // Ginger tabby
  { body: [232, 146, 70], mark: [184, 98, 42], mark2: null, pattern: "tabby", eyes: [150, 210, 90] },
  // Grey tabby
  { body: [150, 152, 160], mark: [96, 98, 108], mark2: null, pattern: "tabby", eyes: [220, 200, 90] },
  // Black
  { body: [74, 70, 78], mark: [60, 56, 64], mark2: null, pattern: "plain", eyes: [230, 200, 70] },
  // White
  { body: [236, 232, 224], mark: [200, 196, 190], mark2: null, pattern: "plain", eyes: [120, 190, 240] },
  // Calico
  { body: [238, 230, 216], mark: [222, 140, 62], mark2: [70, 64, 68], pattern: "patches", eyes: [150, 200, 90] },
];

const NOSE: RGB = [236, 150, 160];
const YARNS: RGB[] = [
  [230, 70, 90], // red
  [80, 150, 240], // blue
  [240, 130, 200], // pink
  [110, 200, 120], // green
  [170, 120, 240], // purple
];

interface Cat extends Creature {
  coat: Coat;
  /** Leg cycle phase. */
  gait: number;
  /** Tail swish phase. */
  swish: number;
  /** 0 normal → 1 crouched (stalking): ears flat, body low and long. */
  crouch: number;
  mode: "walk" | "sit" | "stalk" | "pounce" | "watch";
  /** When the current sit, pounce or watch ends. */
  until: number;
  meander: number;
  /** The ball it's playing with. */
  ball: Ball | null;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Full radius, px; it shrinks as the strand unwinds. */
  radius: number;
  color: RGB;
  born: number;
  /** The unwound strand, oldest first: x, y pairs. */
  strand: number[];
  /** px rolled since the last strand point. */
  rolled: number;
  /** How it's turned, for the wound texture. */
  spin: number;
  /** When it was all unwound (the game's over); 0 while it's still in play. */
  done: number;
}

const DEFAULTS = {
  ...SHARED_TUNING,
  density: 0.9,
  speed: 1,
  sway: 0.04,
  spread: 0.15,
  size: 1,
  farthest: 0.4,
  farBias: 1.2,
  grip: 2.2,
  separation: 900,
  trail: 0.4,
  trailFade: 0.3,
  shimmer: 0.1,
  sparkle: 0,
  sitting: 1,
  swish: 1,
  yarnRange: 360,
};

/** Strand points, at most: when the ball has unwound this much, it's gone. */
const STRAND_MAX = 140;
/** px between strand points. */
const STRAND_STEP = 7;
/** How long the strand lingers after the game's over, s. */
const STRAND_FADE = 6;

const baskets = new WeakMap<Flock<Cat>, Ball[]>();
const basket = (flock: Flock<Cat>) => {
  let balls = baskets.get(flock);
  if (!balls) baskets.set(flock, (balls = []));
  return balls;
};

/** The ball's radius now: smaller the more is unwound. */
const radiusOf = (b: Ball) => b.radius * (1 - 0.6 * Math.min(1, b.strand.length / 2 / STRAND_MAX));

const head = { x: 0, y: 0 };
function headOf(c: Cat) {
  head.x = c.x + Math.cos(c.heading) * c.span * 0.28;
  head.y = c.y + Math.sin(c.heading) * c.span * 0.28;
  return head;
}

function stopPlaying(c: Cat, flock: Flock<Cat>) {
  c.ball = null;
  c.mode = "sit";
  c.until = flock.time + rand(1.5, 4);
}

export const cats: Animal<Cat> = {
  key: "cats",
  label: "Cat",
  swatch: [150, 152, 170],
  defaults: DEFAULTS,
  controls: [
    ["Cats", [
      { key: "sitting", label: "Sitting", min: 0, max: 3, step: 0.05, hint: "How often they sit down for a while." },
      { key: "swish", label: "Tail swish", min: 0, max: 3, step: 0.05, hint: "How much their tails swish." },
    ]],
    ["Yarn", [
      { key: "yarnRange", label: "Yarn range", min: 0, max: 800, step: 10, hint: "How close a cat has to be to notice a ball of yarn you drop. Click to drop one." },
    ]],
  ],
  area: 110000,
  max: 60,
  scale: 1.45,
  speed: 55,
  trail: { light: [150, 140, 150], dark: [160, 150, 170] },

  create: (c) => ({
    ...c,
    coat: COATS[Math.floor(Math.random() * COATS.length)],
    gait: rand(0, TAU),
    swish: rand(0, TAU),
    crouch: 0,
    mode: "walk",
    until: 0,
    meander: rand(0, 100),
    ball: null,
  }),

  enter(c) {
    c.mode = "walk";
    c.ball = null;
  },

  /** Roll the balls: they slow down, bounce off the edges and unwind as they go. */
  prepare(flock, dt) {
    const t = flock.time;
    const balls = basket(flock);
    for (const b of balls) {
      if (b.done) continue;
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > 1) {
        const slow = Math.max(0, 1 - dt * 1.6);
        b.vx *= slow;
        b.vy *= slow;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        const r = radiusOf(b);
        if (b.x < r || b.x > flock.width - r) (b.vx *= -0.7), (b.x = clamp(b.x, r, flock.width - r));
        if (b.y < r || b.y > flock.height - r) (b.vy *= -0.7), (b.y = clamp(b.y, r, flock.height - r));
        b.spin += (speed * dt) / Math.max(4, r);
        b.rolled += speed * dt;
        // Unwind: lay strand behind it as it rolls.
        while (b.rolled > STRAND_STEP) {
          b.rolled -= STRAND_STEP;
          b.strand.push(b.x, b.y);
        }
      }
      if (b.strand.length / 2 >= STRAND_MAX || t - b.born > 40) b.done = t;
    }
    for (let i = balls.length - 1; i >= 0; i--) if (balls[i].done && t - balls[i].done > STRAND_FADE) balls.splice(i, 1);
    for (const c of flock.creatures) if (c.ball && (c.ball.done || !balls.includes(c.ball))) stopPlaying(c, flock);
  },

  /** A tap drops a ball of yarn. */
  tap(x, y, flock) {
    const balls = basket(flock);
    const ball: Ball = {
      x,
      y,
      vx: 0,
      vy: 0,
      radius: clamp(flock.base * 0.17, 24, 42),
      color: YARNS[Math.floor(Math.random() * YARNS.length)],
      born: flock.time,
      strand: [x, y],
      rolled: 0,
      spin: rand(0, TAU),
      done: 0,
    };
    balls.push(ball);
    if (balls.length > 4) balls.splice(0, balls.length - 4);
    const k = flock.tuning as typeof DEFAULTS;
    for (const c of flock.creatures) {
      if (c.ball && !c.ball.done) continue;
      if (Math.hypot(c.x - x, c.y - y) > k.yarnRange * (0.6 + 0.4 * c.depth)) continue;
      c.ball = ball;
      c.mode = "stalk";
    }
  },

  update(c, flock, dt) {
    const k = flock.tuning as typeof DEFAULTS;
    const t = flock.time;
    const cruise = flock.cruise(c);
    flock.begin();
    let crouchTo = 0;

    if (c.ball && (c.mode === "stalk" || c.mode === "pounce" || c.mode === "watch")) {
      const b = c.ball;
      const h = headOf(c);
      const dx = b.x - h.x;
      const dy = b.y - h.y;
      const d = Math.hypot(dx, dy);
      const toward = Math.atan2(b.y - c.y, b.x - c.x);
      if (c.mode === "watch") {
        // Eyes on it, still, rump wiggling, before stalking again.
        flock.steer(c, toward, 0, 6);
        flock.face(c, dt, 4, toward);
        crouchTo = 0.7;
        if (t > c.until) c.mode = "stalk";
      } else if (c.mode === "stalk") {
        // Low and slow, then a pounce when it's close enough.
        flock.steer(c, toward, cruise * (d > c.span * 2.5 ? 1.6 : 0.7), 5);
        crouchTo = 1;
        if (d < c.span * 0.9) {
          c.mode = "pounce";
          c.until = t + 0.45;
        }
      } else {
        // Pounce: a quick dash; a swipe if the paws reach it.
        flock.steer(c, toward, cruise * 5, 14);
        crouchTo = 0;
        if (d < radiusOf(b) + c.span * 0.18) {
          const bat = toward + rand(-0.9, 0.9);
          const hit = rand(140, 300) * (flock.width / 1400 + 0.4);
          b.vx = Math.cos(bat) * hit;
          b.vy = Math.sin(bat) * hit;
          c.mode = "watch";
          c.until = t + rand(0.3, 0.9);
          flock.events.push({ x: b.x, y: b.y, radius: 2, amount: 0.4 });
        } else if (t > c.until) {
          c.mode = "watch";
          c.until = t + rand(0.2, 0.6);
        }
      }
    } else if (c.mode === "sit") {
      flock.steer(c, c.heading, 0, 5);
      if (t > c.until) c.mode = "walk";
    } else {
      c.mode = "walk";
      flock.steer(c, flock.heading + c.bias * k.spread + Math.sin(t * 0.3 + c.meander) * 0.4, cruise, k.grip);
      if (Math.random() < dt * 0.05 * k.sitting) {
        c.mode = "sit";
        c.until = t + rand(2, 6);
      }
    }

    flock.separate(c);
    const speed = flock.move(c, dt, cruise * 6);
    if (!c.ball && flock.passed(c)) flock.reenter(c);
    if (flock.passed(c, c.span * 4)) flock.reenter(c);
    if (speed > 4) flock.face(c, dt, c.mode === "pounce" ? 14 : 5);

    c.gait += (dt * speed) / Math.max(3, c.span * 0.06);
    c.crouch += (crouchTo - c.crouch) * Math.min(1, dt * 5);
    // Tails swish faster when they're hunting.
    c.swish += dt * (c.ball ? 3.2 : 1.2) * Math.max(0.2, k.swish);
  },

  drawAll(flock, pen) {
    for (const b of basket(flock)) drawYarn(b, pen, flock);
    for (const c of flock.creatures) drawCat(c, pen);
  },
};

/** The unwound strand, then the ball: a round of yarn with wound bands across it. */
function drawYarn(b: Ball, pen: Pen, flock: Flock<Cat>) {
  const t = flock.time;
  const fade = b.done ? clamp((t - b.done) / STRAND_FADE, 0, 1) : 0;
  const [r, g, bl] = b.color;
  const strandColor: RGB = [r * 0.85, g * 0.85, bl * 0.85];
  const fog = 0.15 + 0.85 * fade;
  // The strand, as a chain of short lines, gently wavy.
  const s = b.strand;
  for (let i = 2; i + 1 < s.length; i += 2) {
    const wob = Math.sin(i * 0.9) * 2;
    pen.line(s[i - 2], s[i - 1] + wob, s[i], s[i + 1] - wob, strandColor, 1, undefined, fog);
  }
  if (s.length >= 2) pen.line(s[s.length - 2], s[s.length - 1], b.x, b.y, strandColor, 1, undefined, fog);
  if (b.done) return;
  // The ball, popping in when it lands.
  const age = t - b.born;
  const pop = age < 0.3 ? 0.5 + 0.5 * Math.sin((age / 0.3) * Math.PI * 0.5) + 0.15 * Math.sin((age / 0.3) * Math.PI) : 1;
  const R = radiusOf(b) * pop;
  const out = pen.ink;
  pen.shape({ x: b.x, y: b.y, heading: b.spin, span: R, depth: 1, id: 3 }, 1.05, (u, v) => {
    const d = Math.hypot(u, v);
    if (d > 1) return false;
    // Wound bands: two crossing sets of curved threads.
    const band1 = frac(u * 2.6 + v * v * 1.2 + 0.2);
    const band2 = frac(v * 2.6 - u * u * 1.2);
    const thread = band1 < 0.22 || band2 < 0.22;
    const shade = (0.75 + 0.25 * (1 - d)) * (thread ? 0.78 : 1);
    return ink(out, r * shade, g * shade, bl * shade, INK_SCALE, thread ? "~(" : null);
  });
}

/** Inside triangle (a, b, c)? */
function inTri(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

const tail: number[] = [];

/** A cat from above. */
function drawCat(c: Cat, pen: Pen) {
  const S = c.span;
  const out = pen.ink;
  const coat = c.coat;
  const pose = { x: c.x, y: c.y, heading: c.heading, span: S, depth: c.depth, id: c.id };
  const sitting = c.mode === "sit" || c.mode === "watch";
  const moving = !sitting;
  const k = c.crouch;
  // Crouched: longer, lower body, ears flattened back.
  const bodyA = sitting ? 0.17 : 0.21 + 0.04 * k;
  const bodyU = sitting ? -0.03 : -0.06;
  const bodyB = sitting ? 0.18 : 0.16 - 0.02 * k;
  const ear = 1 - 0.55 * k;
  const minW = (pen.cw * 0.5) / S;

  // Tail: a curve off the rump, swishing in a slow S (curled round when sitting).
  tail.length = 0;
  let tu = bodyU - bodyA + 0.02;
  let tv = 0;
  let ang = Math.PI; // pointing back
  const segs = 7;
  const segLen = sitting ? 0.07 : 0.075;
  for (let i = 0; i <= segs; i++) {
    tail.push(tu, tv);
    const curl = sitting ? 0.42 : 0;
    ang += curl + Math.sin(c.swish + i * 0.55) * 0.22 * (sitting ? 0.6 : 1);
    tu += Math.cos(ang) * segLen;
    tv += Math.sin(ang) * segLen;
  }

  pen.shape(pose, 0.85, (u, v) => {
    const av = Math.abs(v);
    // Ears: pointed triangles on top of the head, folding back when crouched.
    if (inTri(u, av, 0.27 + 0.14 * ear, 0.13 + 0.03 * k, 0.27, 0.03, 0.2, 0.15)) {
      return inTri(u, av, 0.26 + 0.1 * ear, 0.12, 0.255, 0.06, 0.215, 0.13) && S > pen.cw * 6
        ? ink(out, NOSE[0] * 0.8, NOSE[1] * 0.7, NOSE[2] * 0.7, INK_SCALE)
        : ink(out, ...coat.body, INK_SCALE);
    }
    // Nose.
    if (S > pen.cw * 5 && inEllipse(u, v, 0.37, 0, 0.022, 0.026)) return ink(out, ...NOSE, INK_SCALE);
    // Head: round.
    if (inEllipse(u, v, 0.26, 0, 0.115, Math.max(0.13, minW))) return paint(out, u, v, coat, c.id, true);
    // Paws: small, stepping; tucked together in front when sitting.
    const paws = sitting
      ? [[0.16, 0.05], [0.16, -0.05]]
      : [[0.12 + 0.04 * Math.sin(c.gait), 0.13], [0.12 - 0.04 * Math.sin(c.gait), -0.13], [-0.19 - 0.04 * Math.sin(c.gait), 0.13], [-0.19 + 0.04 * Math.sin(c.gait), -0.13]];
    for (const [pu, pv] of paws) if (inEllipse(u, v, pu, pv, 0.04, 0.034)) return ink(out, ...pawColor(coat), INK_SCALE);
    // Body.
    if (inEllipse(u, v, bodyU, 0, bodyA, Math.max(bodyB, minW))) return paint(out, u, v, coat, c.id, false);
    // Tail.
    for (let i = 2; i < tail.length; i += 2) {
      const w = Math.max(0.03 - 0.0025 * (i / 2), minW * 0.4);
      if (toSegment(u, v, tail[i - 2], tail[i - 1], tail[i], tail[i + 1]) < w) {
        // Tabbies get rings down the tail.
        return coat.pattern === "tabby" && (i / 2) % 2 === 0 ? ink(out, ...coat.mark, INK_SCALE) : ink(out, ...coat.body, INK_SCALE);
      }
    }
    return false;
  }, { light: 1 + 0.04 * (moving ? Math.sin(c.gait) : 0) });

  // Eyes on the bigger, nearer cats; narrowed to slits when hunting.
  if (S > pen.cw * 6) {
    const e = { x: 0, y: 0 };
    for (const side of [-1, 1]) {
      pen.toWorld(pose, 0.31, 0.05 * side, e);
      pen.dot(e.x, e.y, c.ball ? "'" : "•", coat.eyes, c.depth);
    }
  }
}

/** Coat colour at a point: tabby stripes across the back, calico patches, or plain. */
function paint(out: Ink, u: number, v: number, coat: Coat, seed: number, isHead: boolean): true {
  if (coat.pattern === "tabby") {
    // Stripes across the body; a stripe down the forehead.
    const stripe = isHead ? Math.abs(v) < 0.02 && u > 0.27 : frac(u * 9 + Math.sin(v * 14) * 0.25) < 0.33 && Math.abs(v) > 0.015;
    if (stripe) return ink(out, ...coat.mark, INK_SCALE);
  } else if (coat.pattern === "patches") {
    if (spotted(u, v, 0.16, 0.08, seed)) return ink(out, ...coat.mark, INK_SCALE);
    if (coat.mark2 && spotted(u + 0.3, v - 0.1, 0.18, 0.07, seed + 5)) return ink(out, ...coat.mark2, INK_SCALE);
  }
  return ink(out, ...coat.body, INK_SCALE);
}

/** Paws a shade lighter than the coat. */
const pawColor = (coat: Coat): RGB => (coat.pattern === "patches" ? coat.body : (coat.body.map((x) => Math.min(255, x * 1.1)) as RGB));
