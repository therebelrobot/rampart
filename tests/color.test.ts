import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hexPerceivedValue, hexToHsb, hsbToHex, rotateHueToward, signedHueDistance, solveHsbForValue,
} from "../src/color/convert";
import { generatePalette, orderedUniqueColorIndices, withoutHueShifting } from "../src/color/generate";
import { defaultSettings, type PaletteRecipe } from "../src/color/settings";

const recipe = (overrides: Partial<PaletteRecipe> = {}): PaletteRecipe => ({
  seed: "mossy-lantern-42", settings: { ...defaultSettings }, overrides: {}, ...overrides,
});

test("value is perceptual: yellow reads lighter than blue at equal brightness", () => {
  assert.ok(hexPerceivedValue("#ffff00") > hexPerceivedValue("#0000ff") + 0.4);
});

test("hue rotation takes the shortest arc and never overshoots", () => {
  assert.equal(rotateHueToward(350, 60, 20), 10);
  assert.equal(rotateHueToward(50, 60, 40), 60);
  assert.equal(signedHueDistance(300, 60), 120);
});

test("solving for a value hits the target", () => {
  const solved = solveHsbForValue(220, 0.8, 0.9);
  assert.ok(Math.abs(hexPerceivedValue(hsbToHex(solved)) - 0.9) < 0.01);
  assert.ok(solved.saturation < 0.8, "unreachable light blue gets desaturated");
});

test("same recipe → same palette (deterministic)", () => {
  assert.deepEqual(generatePalette(recipe()).colors, generatePalette(recipe()).colors);
  assert.notDeepEqual(generatePalette(recipe()).colors, generatePalette(recipe({ seed: "other" })).colors);
});

test("ramps follow the book: lights warmer/lighter/less saturated, shadows bluer/darker", () => {
  const palette = generatePalette(recipe({ settings: { ...defaultSettings, bridgingEnabled: false, includeNeutralRamp: false } }));
  for (const ramp of palette.ramps) {
    const tones = ramp.toneColorIndices.map((colorIndex) => palette.colors[colorIndex]);
    for (let position = 1; position < tones.length; position++) {
      assert.ok(tones[position].value > tones[position - 1].value, `${ramp.label} values ascend`);
    }
    const midHsb = hexToHsb(tones[ramp.midtonePosition].hex);
    const lightest = hexToHsb(tones[tones.length - 1].hex);
    const darkest = hexToHsb(tones[0].hex);
    assert.ok(Math.abs(signedHueDistance(lightest.hue, defaultSettings.lightHue)) <= Math.abs(signedHueDistance(midHsb.hue, defaultSettings.lightHue)) + 1);
    assert.ok(Math.abs(signedHueDistance(darkest.hue, defaultSettings.shadowHue)) <= Math.abs(signedHueDistance(midHsb.hue, defaultSettings.shadowHue)) + 1);
    assert.ok(lightest.saturation <= midHsb.saturation + 0.02);
  }
});

test("locked midtone is honoured and anchors the harmony", () => {
  const palette = generatePalette(recipe({ overrides: { 0: { baseHex: "#c0503a", locked: true } } }));
  assert.equal(palette.ramps[0].baseHex, "#c0503a");
});

test("bridging reduces color count and never merges tones within one ramp", () => {
  const settings = { ...defaultSettings, rampCount: 6, harmony: "analogous" as const, bridgingThreshold: 0.08 };
  const bridged = generatePalette(recipe({ settings }));
  const unbridged = generatePalette(recipe({ settings: { ...settings, bridgingEnabled: false } }));
  assert.ok(bridged.colors.length < unbridged.colors.length, `${bridged.colors.length} < ${unbridged.colors.length}`);
  for (const ramp of bridged.ramps) {
    assert.equal(new Set(ramp.toneColorIndices).size, ramp.toneColorIndices.length);
  }
});

test("export order covers every color once", () => {
  const palette = generatePalette(recipe());
  const order = orderedUniqueColorIndices(palette);
  assert.equal(order.length, palette.colors.length);
  assert.equal(new Set(order).size, order.length);
  assert.equal(order[0], palette.sharedShadowColorIndex);
  assert.equal(order[order.length - 1], palette.sharedHighlightColorIndex);
});

test("unshifted comparison keeps hue fixed", () => {
  const palette = generatePalette(withoutHueShifting(recipe({ settings: { ...defaultSettings, includeNeutralRamp: false } })));
  for (const ramp of palette.ramps) {
    const midHue = hexToHsb(ramp.baseHex).hue;
    for (const colorIndex of ramp.toneColorIndices) {
      const tone = hexToHsb(palette.colors[colorIndex].hex);
      if (tone.saturation > 0.15) assert.ok(Math.abs(signedHueDistance(tone.hue, midHue)) < 4);
    }
  }
});

test("all seeds × presets produce sane palettes", () => {
  for (const harmony of ["spread", "monochrome", "analogous", "complementary", "split-complementary", "triadic", "square"] as const) {
    for (let seedNumber = 0; seedNumber < 40; seedNumber++) {
      const palette = generatePalette(recipe({ seed: `s${seedNumber}`, settings: { ...defaultSettings, harmony, rampCount: 1 + (seedNumber % 8) } }));
      assert.ok(palette.colors.every((color) => /^#[0-9a-f]{6}$/.test(color.hex)));
    }
  }
});
