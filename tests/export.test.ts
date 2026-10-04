import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildAdobeSwatchExchangeFile, buildGimpPalette, buildProcreateSwatchesFile, buildProcreateSwatchesJson } from "../src/export/formats";
import { crc32 } from "../src/export/zip";
import { decodeRecipeFromUrl, encodeRecipeForUrl, mergeImportedJson } from "../src/storage/library";
import { defaultSettings } from "../src/color/settings";

const colors = ["#1b1f33", "#c0503a", "#f4ecd6"];

test("crc32 known value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("procreate json shape", () => {
  const parsed = JSON.parse(buildProcreateSwatchesJson("Test", colors));
  assert.equal(parsed[0].name, "Test");
  assert.equal(parsed[0].swatches.length, 3);
  assert.ok(Math.abs(parsed[0].swatches[1].hue - 9 / 360) < 0.01);
  assert.equal(parsed[0].swatches[0].colorSpace, 0);
});

test("write sample files for external validation", () => {
  mkdirSync(".test-build/out", { recursive: true });
  writeFileSync(".test-build/out/sample.swatches", buildProcreateSwatchesFile("Sample ✦", colors));
  writeFileSync(".test-build/out/sample.ase", buildAdobeSwatchExchangeFile("Sample", colors));
  writeFileSync(".test-build/out/sample.gpl", buildGimpPalette("Sample", colors, 3));
});

test("recipe survives URL round trip (unicode seed)", () => {
  const recipe = { seed: "mossy ✦ lantern", settings: defaultSettings, overrides: { 1: { baseHex: "#abcdef", locked: true, label: "Robe" } } };
  assert.deepEqual(decodeRecipeFromUrl(encodeRecipeForUrl(recipe)), recipe);
});

test("library import merges and rejects junk", () => {
  const palette = { id: "a", name: "One", createdAt: "2026-01-01", updatedAt: "2026-01-01", recipe: { seed: "x", settings: {}, overrides: {} }, hexColors: ["#fff"] };
  const result = mergeImportedJson([], JSON.stringify({ application: "rampart", palettes: [palette, { nonsense: true }] }));
  assert.equal(result.addedCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.equal(result.palettes[0].hexColors[0], "#ffffff");
  const newer = mergeImportedJson(result.palettes, JSON.stringify({ ...palette, name: "Two", updatedAt: "2026-02-01" }));
  assert.equal(newer.updatedCount, 1);
  assert.equal(newer.palettes[0].name, "Two");
});
