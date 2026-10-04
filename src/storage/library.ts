/**
 * Saved palettes live in localStorage, with JSON import/export for backup and
 * moving between devices (desktop ↔ iPad).
 *
 * Each save keeps both the *recipe* (seed + settings + overrides, so you can
 * reopen it and keep tweaking) and the *resolved colors* (so a future change
 * to the generator never silently alters a palette you already use).
 */

import { isValidHex, normalizeHex } from "../color/convert";
import { type PaletteRecipe, sanitizeSettings } from "../color/settings";

export interface SavedPalette {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  recipe: PaletteRecipe;
  /** export-ordered hex colors at the time of saving */
  hexColors: string[];
}

export interface LibraryExport {
  application: "rampart";
  formatVersion: 1;
  exportedAt: string;
  palettes: SavedPalette[];
}

const storageKey = "rampart.library.v1";

export function readLibrary(): SavedPalette[] {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.flatMap((entry) => sanitizeSavedPalette(entry) ?? []) : [];
  } catch {
    return [];
  }
}

/** Returns false when storage is unavailable (private browsing, quota). */
export function writeLibrary(palettes: SavedPalette[]): boolean {
  try {
    localStorage.setItem(storageKey, JSON.stringify(palettes));
    return true;
  } catch {
    return false;
  }
}

export function createPaletteId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildLibraryExport(palettes: SavedPalette[]): LibraryExport {
  return { application: "rampart", formatVersion: 1, exportedAt: new Date().toISOString(), palettes };
}

export interface ImportResult {
  palettes: SavedPalette[];
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
}

/**
 * Accepts a full library export, a bare array, or a single saved palette.
 * Same id + newer updatedAt replaces; same id + older is skipped; new ids are added.
 */
export function mergeImportedJson(existing: SavedPalette[], jsonText: string): ImportResult {
  const parsed: unknown = JSON.parse(jsonText);
  const candidates: unknown[] = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.palettes)
      ? parsed.palettes
      : [parsed];

  const merged = [...existing];
  let addedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  for (const candidate of candidates) {
    const palette = sanitizeSavedPalette(candidate);
    if (!palette) {
      skippedCount++;
      continue;
    }
    const existingIndex = merged.findIndex((saved) => saved.id === palette.id);
    if (existingIndex === -1) {
      merged.push(palette);
      addedCount++;
    } else if (palette.updatedAt > merged[existingIndex].updatedAt) {
      merged[existingIndex] = palette;
      updatedCount++;
    } else {
      skippedCount++;
    }
  }
  return { palettes: merged, addedCount, updatedCount, skippedCount };
}

export function sanitizeRecipe(candidate: unknown): PaletteRecipe | null {
  if (!isRecord(candidate) || typeof candidate.seed !== "string") return null;
  const overrides: PaletteRecipe["overrides"] = {};
  if (isRecord(candidate.overrides)) {
    for (const [rampKey, rawOverride] of Object.entries(candidate.overrides)) {
      const rampIndex = Number(rampKey);
      if (!Number.isInteger(rampIndex) || rampIndex < 0 || rampIndex > 16 || !isRecord(rawOverride)) continue;
      overrides[rampIndex] = {
        ...(typeof rawOverride.baseHex === "string" && isValidHex(rawOverride.baseHex) ? { baseHex: normalizeHex(rawOverride.baseHex) } : {}),
        ...(rawOverride.locked === true ? { locked: true } : {}),
        ...(typeof rawOverride.label === "string" ? { label: rawOverride.label.slice(0, 40) } : {}),
      };
    }
  }
  return {
    seed: candidate.seed.slice(0, 120),
    settings: sanitizeSettings(isRecord(candidate.settings) ? candidate.settings : undefined),
    overrides,
  };
}

function sanitizeSavedPalette(candidate: unknown): SavedPalette | null {
  if (!isRecord(candidate)) return null;
  const recipe = sanitizeRecipe(candidate.recipe);
  if (!recipe) return null;
  const hexColors = Array.isArray(candidate.hexColors)
    ? candidate.hexColors.filter((hex): hex is string => typeof hex === "string" && isValidHex(hex)).map(normalizeHex)
    : [];
  const now = new Date().toISOString();
  return {
    id: typeof candidate.id === "string" && candidate.id ? candidate.id : createPaletteId(),
    name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim().slice(0, 80) : "Untitled palette",
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : now,
    recipe,
    hexColors,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Recipe ↔ URL hash, so a palette can be bookmarked or opened on the iPad. */
export function encodeRecipeForUrl(recipe: PaletteRecipe): string {
  const json = JSON.stringify(recipe);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeRecipeFromUrl(encoded: string): PaletteRecipe | null {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return sanitizeRecipe(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}
