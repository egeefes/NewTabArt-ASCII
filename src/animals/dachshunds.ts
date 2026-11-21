/**
 * Dachshunds, trotting along the course.
 *
 * Seen from above: a long sausage of a body on four stubby legs that patter
 * back and forth, a deep chest, a head with a long snout and a black nose,
 * floppy ears that flap as they trot, and a tail that wags. Each dog has its
 * own coat: red, black and tan, chocolate or cream. They meander, and every so
 * often stop to sniff the ground, nose twitching and tail going, before
 * trotting on. They leave faint paw prints.
 *
 * A tap drops a little bone. Dogs within Bone range race over, ears flying;
 * the first one there snaps it up and trots off proudly with it held crosswise
 * in its mouth, tail wagging hard, then settles down to chew it until it's
 * gone. The others give up and go back to sniffing about.
 */
import { SHARED_TUNING, type Animal, type Creature, type Flock } from "../flock";
import { INK_DARK, INK_SCALE, ink, type RGB } from "../ink";
import { angleDiff, clamp, rand, TAU } from "../math";
import type { Pen } from "../renderer";
import { inEllipse, toSegment } from "./shapes";

interface Coat {
  body: RGB;
  /** Down the back. */
  saddle: RGB;
  ears: RGB;
  /** Snout and paws. */
  points: RGB;
}

const COATS: Coat[] = [
  // Red
  { body: [196, 108, 50], saddle: [176, 94, 42], ears: [110, 52, 24], points: [226, 150, 86] },
  // Black and tan
  { body: [86, 72, 64], saddle: [70, 58, 52], ears: [44, 36, 32], points: [214, 146, 78] },
  // Chocolate
  { body: [132, 78, 50], saddle: [116, 68, 44], ears: [76, 42, 26], points: [176, 120, 84] },
  // Cream
  { body: [230, 196, 148], saddle: [218, 182, 134], ears: [170, 120, 74], points: [244, 222, 186] },
];

const NOSE: RGB = [20, 16, 14];
const EYE: RGB = [16, 12, 10];
const BONE: RGB = [244, 236, 214];

interface Dog extends Creature {
  coat: Coat;
  /** Leg cycle phase. */
  gait: number;
  /** Tail wag phase, and how hard it's wagging (0..1). */
  wag: number;
  wagging: number;
  /** Ears: how far they're flying back (0 hanging → 1 streaming). */
  ears: number;
  mode: "trot" | "sniff" | "chase" | "carry" | "chew";
  /** When the current sniff, carry or chew ends. */
  until: number;
  /** Slow meander off the course. */
  meander: number;
  /** The bone it's racing to, carrying or chewing. */
  bone: Bone | null;
}

interface Bone {
  x: number;
  y: number;
  angle: number;
  born: number;
  /** Picked up by this dog. */
  owner: Dog | null;
  /** 1 whole → 0 chewed away. */
  left: number;
}

const DEFAULTS = {
  ...SHARED_TUNING,
  density: 0.9,
  speed: 1,
  sway: 0.05,
  spread: 0.15,
  size: 1,
  farthest: 0.4,
  farBias: 1.2,
  grip: 2.5,
  separation: 900,
  trail: 0.6,
  trailFade: 0.35,
  shimmer: 0.1,
  sparkle: 0,
  sniff: 1,
  wag: 1,
  boneRange: 320,
};

/** Bones nobody takes vanish after this long, s. */
const BONE_LIFE = 30;

const yards = new WeakMap<Flock<Dog>, Bone[]>();
const yard = (flock: Flock<Dog>) => {
  let bones = yards.get(flock);
  if (!bones) yards.set(flock, (bones = []));
  return bones;
};

/** Size of a bone, px: a little shorter than a dog's head-and-snout. */
const boneSize = (flock: Flock<Dog>) => clamp(flock.base * 0.26, 44, 72);

const nose = { x: 0, y: 0 };
/** Where the dog's mouth is, px. */
function mouth(d: Dog) {
  const c = Math.cos(d.heading);
  const s = Math.sin(d.heading);
  nose.x = d.x + c * d.span * 0.44;
  nose.y = d.y + s * d.span * 0.44;
  return nose;
}

function giveUp(d: Dog, flock: Flock<Dog>) {
  d.bone = null;
  // A disappointed sniff before trotting on.
  d.mode = "sniff";
  d.until = flock.time + rand(0.6, 1.4);
}

export const dachshunds: Animal<Dog> = {
  key: "dachshunds",
  label: "Dachshund",
  swatch: [188, 102, 46],
  defaults: DEFAULTS,
  controls: [
    ["Dogs", [
      { key: "sniff", label: "Sniffing", min: 0, max: 3, step: 0.05, hint: "How often they stop to sniff the ground." },
      { key: "wag", label: "Wag", min: 0, max: 3, step: 0.05, hint: "How fast their tails wag." },
    ]],
    ["Bones", [
      { key: "boneRange", label: "Bone range", min: 0, max: 700, step: 10, hint: "How close a dog has to be to notice a bone you drop. Click to drop one." },
    ]],
  ],
  area: 140000,
  max: 50,
  scale: 1.6,
  speed: 70,
  trail: { light: [150, 110, 70], dark: [170, 130, 90] },

  create: (c) => ({
    ...c,
    coat: COATS[Math.floor(Math.random() * COATS.length)],
    gait: rand(0, TAU),
    wag: rand(0, TAU),
    wagging: 0.4,
    ears: 0,
    mode: "trot",
    until: 0,
    meander: rand(0, 100),
    bone: null,
  }),

  enter(d) {
    d.mode = "trot";
    d.bone = null;
  },

  prepare(flock) {
    const t = flock.time;
    const bones = yard(flock);
    for (let i = bones.length - 1; i >= 0; i--) {
      const b = bones[i];
      if ((!b.owner && t - b.born > BONE_LIFE) || b.left <= 0) bones.splice(i, 1);
    }
    // Anyone still chasing a bone that's gone or taken gives up.
    for (const d of flock.creatures) {
      if (d.mode === "chase" && (!d.bone || !bones.includes(d.bone) || d.bone.owner)) giveUp(d, flock);
    }
  },

  /** A tap drops a little bone. */
  tap(x, y, flock) {
    const bones = yard(flock);
    bones.push({ x, y, angle: rand(-0.3, 0.3), born: flock.time, owner: null, left: 1 });
    if (bones.length > 8) bones.splice(0, bones.length - 8);
    // Every dog in range that isn't busy with a bone already races over.
    const k = flock.tuning as typeof DEFAULTS;
    const fresh = bones[bones.length - 1];
    for (const d of flock.creatures) {
      if (d.mode === "carry" || d.mode === "chew") continue;
      if (Math.hypot(d.x - x, d.y - y) > k.boneRange * (0.6 + 0.4 * d.depth)) continue;
      d.bone = fresh;
      d.mode = "chase";
    }
  },

  update(d, flock, dt) {
    const k = flock.tuning as typeof DEFAULTS;
    const t = flock.time;
    const cruise = flock.cruise(d);
    flock.begin();
    let wagTo = 0.4;
    let earsTo = 0;

    if (d.mode === "chase" && d.bone) {
      // Zoomies: flat out, straight for it.
      const b = d.bone;
      const m = mouth(d);
      const dist = Math.hypot(b.x - m.x, b.y - m.y);
      flock.steer(d, Math.atan2(b.y - d.y, b.x - d.x), cruise * 2.6, 7);
      wagTo = 1;
      earsTo = 1;
      if (dist < Math.max(6, boneSize(flock) * 0.45)) {
        b.owner = d;
        d.mode = "carry";
        d.until = t + rand(4, 8);
      }
    } else if (d.mode === "carry" && d.bone) {
      // Trotting off proudly with it.
      flock.steer(d, flock.heading + Math.sin(t * 0.7 + d.meander) * 0.6, cruise * 1.25, k.grip);
      wagTo = 1;
      earsTo = 0.4;
      if (t > d.until) {
        d.mode = "chew";
        d.until = t + rand(3, 5);
      }
    } else if (d.mode === "chew" && d.bone) {
      // Settled down, gnawing, the bone shrinking away.
      flock.steer(d, d.heading, 0, 6);
      d.bone.left -= dt / Math.max(0.5, d.until - t + dt);
      wagTo = 0.6;
      if (t > d.until || d.bone.left <= 0) {
        d.bone.left = 0;
        d.bone = null;
        d.mode = "trot";
      }
    } else if (d.mode === "sniff") {
      // Nose to the ground, still.
      flock.steer(d, d.heading, 0, 5);
      wagTo = 0.7;
      if (t > d.until) d.mode = "trot";
    } else {
      d.mode = "trot";
      flock.steer(d, flock.heading + d.bias * k.spread + Math.sin(t * 0.4 + d.meander) * 0.35, cruise, k.grip);
      if (Math.random() < dt * 0.08 * k.sniff) {
        d.mode = "sniff";
        d.until = t + rand(1, 3.5);
      }
    }

    flock.separate(d);
    const speed = flock.move(d, dt, cruise * 3);
    if (d.mode !== "carry" && d.mode !== "chew" && flock.passed(d)) flock.reenter(d);
    if (flock.passed(d, d.span * 3)) {
      // A carrier that wanders off screen takes its bone with it.
      if (d.bone && d.bone.owner === d) d.bone.left = 0;
      flock.reenter(d);
    }
    if (speed > 4) flock.face(d, dt, d.mode === "chase" ? 9 : 5);

    // Legs patter with speed; tail and ears ease toward their mood.
    d.gait += (dt * speed) / Math.max(3, d.span * 0.05);
    d.wagging += (wagTo - d.wagging) * Math.min(1, dt * 3);
    d.wag += dt * TAU * (2.2 + 4 * d.wagging) * k.wag;
    d.ears += (Math.max(earsTo, clamp(speed / (cruise * 2.4), 0, 1)) - d.ears) * Math.min(1, dt * 4);
    if (d.mode === "sniff") d.wag += Math.sin(t * 30) * dt;
  },

  drawAll(flock, pen) {
    for (const b of yard(flock)) if (!b.owner) drawBone(pen, b.x, b.y, b.angle, boneSize(flock), 1, flock.time - b.born);
    for (const d of flock.creatures) drawDog(d, pen, flock);
  },
};

/** A cartoon bone: a shaft with two round knobs at each end. */
function drawBone(pen: Pen, x: number, y: number, angle: number, size: number, left: number, age: number) {
  const out = pen.ink;
  // Drops in with a little bounce.
  const pop = age < 0.35 ? 0.6 + 0.4 * Math.sin((age / 0.35) * Math.PI * 0.5) + 0.12 * Math.sin((age / 0.35) * Math.PI) : 1;
  const len = 0.5 * left;
  pen.shape({ x, y, heading: angle, span: size * pop, depth: 1, id: 7 }, 0.75, (u, v) => {
    const shaft = Math.abs(u) <= len && Math.abs(v) <= 0.09;
    const knob = (cu: number) => inEllipse(u, v, cu, 0.12, 0.15, 0.13) || inEllipse(u, v, cu, -0.12, 0.15, 0.13);
    if (shaft || knob(len) || (left > 0.35 && knob(-len))) {
      const shade = 0.88 + 0.12 * (1 - Math.abs(v) / 0.24);
      return ink(out, BONE[0] * shade, BONE[1] * shade, BONE[2] * shade, INK_SCALE);
    }
    return false;
  });
}

/** A dachshund from above. */
function drawDog(d: Dog, pen: Pen, flock: Flock<Dog>) {
  const S = d.span;
  const out = pen.ink;
  const c = d.coat;
  const pose = { x: d.x, y: d.y, heading: d.heading, span: S, depth: d.depth, id: d.id };
  const moving = d.mode !== "sniff" && d.mode !== "chew";
  const step = moving ? Math.sin(d.gait) : 0;
  const tailSwing = Math.sin(d.wag) * (0.25 + 0.55 * d.wagging);
  // Sniffing: the head dips and the nose twitches side to side.
  const headDip = d.mode === "sniff" ? 0.02 : 0;
  const twitch = d.mode === "sniff" ? Math.sin(flock.time * 18 + d.id) * 0.012 : d.mode === "chew" ? Math.sin(flock.time * 9) * 0.015 : 0;
  // Ears hang at the sides, or stream back when running.
  const earU = 0.29 - 0.08 * d.ears;
  const earV = 0.135 + 0.025 * Math.sin(d.gait * 0.5) * d.ears;
  const minW = (pen.cw * 0.5) / S;

  pen.shape(pose, 0.62, (u, v) => {
    const av = Math.abs(v);
    // Nose.
    if (inEllipse(u, v - twitch, 0.45 - headDip, 0, 0.03, 0.034)) return ink(out, ...NOSE, INK_DARK);
    // Snout: long, in the coat's lighter points colour.
    if (toSegment(u, v - twitch, 0.33, 0, 0.44 - headDip, 0) < Math.max(0.048, minW * 0.6)) return ink(out, ...c.points, INK_SCALE);
    // Ears: floppy ovals beside the head, darker.
    if (inEllipse(u, av, earU, earV, 0.09, 0.055)) return ink(out, ...c.ears, INK_SCALE);
    // Head.
    if (inEllipse(u, v, 0.29, 0, 0.08, Math.max(0.085, minW))) return ink(out, ...c.body, INK_SCALE);
    // Paws: stubby, pattering fore and aft, in alternate pairs.
    for (const [pu, side, ph] of [[0.14, 1, 0], [0.14, -1, Math.PI], [-0.19, 1, Math.PI], [-0.19, -1, 0]] as const) {
      if (inEllipse(u, v, pu + 0.04 * Math.sin(d.gait + ph) * (moving ? 1 : 0), 0.15 * side, 0.05, 0.045)) return ink(out, ...c.points, INK_SCALE);
    }
    // The long body, a touch wider at the chest, with a darker saddle down the back.
    const dist = toSegment(u, v, -0.28, 0, 0.22, 0);
    const half = Math.max(minW, 0.105 + 0.015 * Math.max(0, u - 0.05) / 0.17);
    if (dist < half) {
      return av < half * 0.45 && u < 0.18 && u > -0.25 ? ink(out, ...c.saddle, INK_SCALE) : ink(out, ...c.body, INK_SCALE);
    }
    return false;
  }, { light: 1 + 0.04 * step });

  // Eyes on the bigger, nearer dogs.
  if (S > pen.cw * 6) {
    const e = { x: 0, y: 0 };
    for (const side of [-1, 1]) {
      pen.toWorld(pose, 0.32, 0.045 * side, e);
      pen.dot(e.x, e.y, "•", EYE, d.depth);
    }
  }

  // Tail: a thin line off the rump, wagging.
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 0 };
  pen.toWorld(pose, -0.32, 0, a);
  pen.toWorld(pose, -0.3 - 0.17 * Math.cos(tailSwing), 0.17 * Math.sin(tailSwing), b);
  pen.line(a.x, a.y, b.x, b.y, c.body, d.depth);

  // The bone, held crosswise in its mouth.
  if (d.bone && d.bone.owner === d) {
    const m = mouth(d);
    drawBone(pen, m.x, m.y, d.heading + Math.PI / 2 + (d.mode === "chew" ? Math.sin(flock.time * 9) * 0.15 : 0), boneSize(flock) * (0.6 + 0.4 * d.depth), d.bone.left, 10);
  }

  // Paw prints, now and then.
  if (moving && Math.abs(Math.sin(d.gait)) > 0.97) pen.shed(d.x, d.y, 0.03 * d.depth);
}
