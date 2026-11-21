import type { Animal } from "../flock";
import { bees } from "./bees";
import { butterflies } from "./butterflies";
import { cats } from "./cats";
import { crabs } from "./crabs";
import { dachshunds } from "./dachshunds";
import { cranes } from "./cranes";
import { dragonflies } from "./dragonflies";
import { frogs } from "./frogs";
import { jellyfish } from "./jellyfish";
import { koi } from "./koi";

/** Every animal, in the order the choices show them. */
export const ANIMALS = {
  butterflies,
  koi,
  bees,
  jellyfish,
  dragonflies,
  frogs,
  cranes,
  crabs,
  dachshunds,
  cats,
} satisfies Record<string, Animal<any>>;

export type AnimalKey = keyof typeof ANIMALS;

export const ANIMAL_KEYS = Object.keys(ANIMALS) as AnimalKey[];
