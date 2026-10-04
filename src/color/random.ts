/**
 * Seeded randomness. The same seed string + the same settings always produce
 * the same palette, so a seed is a shareable, reproducible recipe.
 *
 * Each ramp draws from its own stream (seed + ramp index), so changing the
 * ramp count or locking one ramp doesn't reshuffle the others.
 */

/** cyrb53 string hash → 53-bit integer */
export function hashString(input: string): number {
  let firstHash = 0xdeadbeef;
  let secondHash = 0x41c6ce57;
  for (let characterIndex = 0; characterIndex < input.length; characterIndex++) {
    const characterCode = input.charCodeAt(characterIndex);
    firstHash = Math.imul(firstHash ^ characterCode, 2654435761);
    secondHash = Math.imul(secondHash ^ characterCode, 1597334677);
  }
  firstHash = Math.imul(firstHash ^ (firstHash >>> 16), 2246822507) ^ Math.imul(secondHash ^ (secondHash >>> 13), 3266489909);
  secondHash = Math.imul(secondHash ^ (secondHash >>> 16), 2246822507) ^ Math.imul(firstHash ^ (firstHash >>> 13), 3266489909);
  return 4294967296 * (2097151 & secondHash) + (firstHash >>> 0);
}

export type RandomSource = () => number;

/** mulberry32 PRNG — returns floats in [0, 1) */
export function createRandomSource(seedText: string): RandomSource {
  let state = hashString(seedText) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomBetween = (random: RandomSource, minimum: number, maximum: number): number =>
  minimum + (maximum - minimum) * random();

const seedAdjectives = [
  "mossy", "ember", "dusky", "lunar", "solar", "feral", "quiet", "rusty", "velvet", "tidal",
  "copper", "misty", "amber", "cobalt", "wild", "gilded", "hollow", "verdant", "ashen", "glimmer",
  "rooted", "stormy", "candied", "faded", "electric", "woolen", "salted", "sunlit", "midnight", "ferric",
];
const seedNouns = [
  "fern", "circuit", "lantern", "otter", "moth", "orchard", "tide", "bramble", "sprite", "dune",
  "spire", "beetle", "harbor", "cinder", "lichen", "comet", "panda", "kettle", "grove", "pixel",
  "solder", "loom", "sigil", "marsh", "relay", "petal", "garnet", "fox", "cairn", "antenna",
];

/** A friendly, memorable seed like "mossy-lantern-42" */
export function generateSeedPhrase(): string {
  const pick = <Item,>(items: Item[]) => items[Math.floor(Math.random() * items.length)];
  return `${pick(seedAdjectives)}-${pick(seedNouns)}-${Math.floor(Math.random() * 100)}`;
}
