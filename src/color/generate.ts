/**
 * The palette engine. Each step maps to a rule from the book:
 *
 *  1. Value first. Every tone gets a target *perceived value* (OKLab L) laid
 *     out like the book's 7-value grayscale scale, spaced far enough apart
 *     that neighbouring tones don't blend.
 *  2. Pick base colors (midtones) — the "desired colors" — from a harmony
 *     scheme (monochrome / analogous / complementary …) or the user.
 *  3. Build a ramp around each midtone with hue shifting:
 *       lighter → hue toward the light source (yellow), saturation down, value up
 *       darker  → hue toward the shadow color (blue), saturation up, value down
 *  4. Shared "binding" colors: one near-black darkest shadow and one near-white
 *     highlight used by every ramp, which ties the palette together.
 *  5. Color bridging: tones from different ramps that look nearly the same get
 *     replaced with one in-between color, so the palette is smaller and more
 *     cohesive (and easier to animate).
 *  6. Check: flag neighbouring tones whose values are too close.
 */

import {
  type HsbColor,
  averageColorsPerceptually,
  clampUnit,
  hexPerceivedValue,
  hexToHsb,
  hexToRgb,
  hsbToHex,
  isValidHex,
  normalizeHex,
  perceptualDistance,
  rotateHueToward,
  solveHsbForValue,
  wrapHueDegrees,
} from "./convert";
import { type RandomSource, createRandomSource, randomBetween } from "./random";
import type { HarmonyScheme, PaletteRecipe, PaletteSettings } from "./settings";

export type ColorRole = "shared-shadow" | "shared-highlight" | "shadow" | "midtone" | "light" | "bridged";

/** The neutral ramp's override lives at a fixed key so changing the ramp count never moves it. */
export const neutralRampOverrideKey = 16;

/** Which key in recipe.overrides belongs to a generated ramp. */
export const overrideKeyForRamp = (ramp: { rampIndex: number; isNeutral: boolean }): number =>
  ramp.isNeutral ? neutralRampOverrideKey : ramp.rampIndex;

export interface PaletteColor {
  hex: string;
  value: number;
  role: ColorRole;
  /** indices of ramps that use this color (more than one → a binding color) */
  usedByRampIndices: number[];
}

export interface GeneratedRamp {
  rampIndex: number;
  label: string;
  isNeutral: boolean;
  locked: boolean;
  baseHex: string;
  /** palette color indices, ordered darkest → lightest, midtone included */
  toneColorIndices: number[];
  /** position of the midtone within toneColorIndices */
  midtonePosition: number;
}

export interface PaletteWarning {
  kind: "value-blend" | "value-squeeze" | "procreate-limit" | "near-duplicate";
  message: string;
}

export interface GeneratedPalette {
  colors: PaletteColor[];
  ramps: GeneratedRamp[];
  sharedShadowColorIndex: number | null;
  sharedHighlightColorIndex: number | null;
  warnings: PaletteWarning[];
}

/** Perceived-value anchors for the shared colors and the usable range for ramps. */
const sharedShadowValue = 0.2;
const sharedHighlightValue = 0.965;
const rampValueFloorWithSharedShadow = 0.27;
const rampValueFloorAlone = 0.2;
const rampValueCeilingWithSharedHighlight = 0.9;
const rampValueCeilingAlone = 0.95;

/** Hue offsets (degrees from the anchor hue) for each harmony scheme, cycled for extra ramps. */
const harmonyHueOffsets: Record<Exclude<HarmonyScheme, "spread">, number[]> = {
  monochrome: [0],
  analogous: [0, 30, -30, 60, -60, 15, -15, 45],
  complementary: [0, 180, 25, 205, -25, 155],
  "split-complementary": [0, 150, 210, 20, 170, 230],
  triadic: [0, 120, 240],
  square: [0, 90, 180, 270],
};

function chooseMidtoneHue(
  scheme: HarmonyScheme,
  anchorHue: number,
  rampIndex: number,
  rampRandom: RandomSource,
): number {
  if (scheme === "spread") {
    // golden-angle spacing spreads any number of hues evenly; a little jitter keeps it organic
    return wrapHueDegrees(anchorHue + rampIndex * 137.508 + randomBetween(rampRandom, -18, 18));
  }
  const offsets = harmonyHueOffsets[scheme];
  const cycle = Math.floor(rampIndex / offsets.length);
  const jitterRange = scheme === "monochrome" ? 5 : 8;
  const cycleNudge = scheme === "monochrome" ? 0 : cycle * 12;
  return wrapHueDegrees(
    anchorHue + offsets[rampIndex % offsets.length] + cycleNudge + randomBetween(rampRandom, -jitterRange, jitterRange),
  );
}

interface ToneDraft {
  hex: string;
  value: number;
  role: ColorRole;
  rampIndex: number;
  /** position within the ramp, dark → light */
  positionInRamp: number;
}

interface RampDraft {
  rampIndex: number;
  label: string;
  isNeutral: boolean;
  locked: boolean;
  baseHex: string;
  tones: ToneDraft[];
  midtonePosition: number;
}

const defaultRampLabels = ["Ramp A", "Ramp B", "Ramp C", "Ramp D", "Ramp E", "Ramp F", "Ramp G", "Ramp H"];

/** Resolve each ramp's midtone, respecting user overrides and the harmony scheme. */
function resolveMidtones(recipe: PaletteRecipe): { rampIndex: number; base: HsbColor; isNeutral: boolean; locked: boolean; label: string }[] {
  const { seed, settings, overrides } = recipe;
  const globalRandom = createRandomSource(`${seed}#anchor`);

  // If the user has pinned any chromatic midtone, the harmony is built around it.
  let anchorHue = globalRandom() * 360;
  for (let rampIndex = 0; rampIndex < settings.rampCount; rampIndex++) {
    const overrideHex = overrides[rampIndex]?.baseHex;
    if (overrideHex && isValidHex(overrideHex)) {
      const pinnedHsb = hexToHsb(overrideHex);
      // undo this ramp's own harmony offset so the others land in the right place
      const schemeOffset = settings.harmony === "spread"
        ? rampIndex * 137.508
        : harmonyHueOffsets[settings.harmony][rampIndex % harmonyHueOffsets[settings.harmony].length];
      anchorHue = wrapHueDegrees(pinnedHsb.hue - schemeOffset);
      break;
    }
  }

  const midtones: { rampIndex: number; base: HsbColor; isNeutral: boolean; locked: boolean; label: string }[] = [];
  const totalRampCount = settings.rampCount + (settings.includeNeutralRamp ? 1 : 0);

  for (let rampIndex = 0; rampIndex < totalRampCount; rampIndex++) {
    const isNeutral = settings.includeNeutralRamp && rampIndex === settings.rampCount;
    const override = overrides[isNeutral ? neutralRampOverrideKey : rampIndex];
    const rampRandom = createRandomSource(isNeutral ? `${seed}#neutral` : `${seed}#ramp${rampIndex}`);
    // draw in a fixed order so each value is stable regardless of which branch runs
    const hueDraw = chooseMidtoneHue(settings.harmony, anchorHue, rampIndex, rampRandom);
    const saturationDraw = rampRandom();
    const valueDraw = rampRandom();

    let base: HsbColor;
    if (override?.baseHex && isValidHex(override.baseHex)) {
      base = hexToHsb(override.baseHex);
    } else if (isNeutral) {
      // neutrals lean slightly toward the shadow hue so they sit in the same light
      const neutralHue = rotateHueToward(anchorHue, settings.shadowHue, 90);
      const neutralValue = 0.5 + valueDraw * 0.14;
      base = solveHsbForValue(neutralHue, 0.06 + saturationDraw * 0.1, neutralValue);
    } else {
      const saturation = settings.baseSaturationMinimum +
        (settings.baseSaturationMaximum - settings.baseSaturationMinimum) * saturationDraw;
      // monochrome palettes need their ramps separated by value/saturation instead of hue
      const valueRange = settings.harmony === "monochrome"
        ? { minimum: Math.max(0.35, settings.baseValueMinimum - 0.1), maximum: Math.min(0.8, settings.baseValueMaximum + 0.1) }
        : { minimum: settings.baseValueMinimum, maximum: settings.baseValueMaximum };
      const targetValue = valueRange.minimum + (valueRange.maximum - valueRange.minimum) * valueDraw;
      base = solveHsbForValue(hueDraw, saturation, targetValue);
    }

    midtones.push({
      rampIndex,
      base,
      isNeutral,
      locked: Boolean(override?.locked),
      label: override?.label?.trim() || (isNeutral ? "Neutral" : defaultRampLabels[rampIndex] ?? `Ramp ${rampIndex + 1}`),
    });
  }
  return midtones;
}

function buildRamp(
  settings: PaletteSettings,
  midtone: { rampIndex: number; base: HsbColor; isNeutral: boolean; locked: boolean; label: string },
  warnings: PaletteWarning[],
): RampDraft {
  const baseHex = hsbToHex(midtone.base);
  const midtoneValue = hexPerceivedValue(baseHex);
  const valueFloor = settings.includeSharedShadow ? rampValueFloorWithSharedShadow : rampValueFloorAlone;
  const valueCeiling = settings.includeSharedHighlight ? rampValueCeilingWithSharedHighlight : rampValueCeilingAlone;

  // Even spacing at the preferred step, compressed only if the midtone sits too close to an end.
  const shadowValueStep = settings.shadowStepCount > 0
    ? Math.min(settings.valueStep, Math.max(0, midtoneValue - valueFloor) / settings.shadowStepCount)
    : 0;
  const lightValueStep = settings.lightStepCount > 0
    ? Math.min(settings.valueStep, Math.max(0, valueCeiling - midtoneValue) / settings.lightStepCount)
    : 0;

  if (settings.shadowStepCount > 0 && shadowValueStep < settings.minimumValueContrast) {
    warnings.push({
      kind: "value-squeeze",
      message: `${midtone.label}: midtone is too dark to fit ${settings.shadowStepCount} distinct shadow tone${settings.shadowStepCount > 1 ? "s" : ""}. Lighten it or use fewer shadows.`,
    });
  }
  if (settings.lightStepCount > 0 && lightValueStep < settings.minimumValueContrast) {
    warnings.push({
      kind: "value-squeeze",
      message: `${midtone.label}: midtone is too light to fit ${settings.lightStepCount} distinct light tone${settings.lightStepCount > 1 ? "s" : ""}. Darken it or use fewer lights.`,
    });
  }

  // Neutral ramps hue-shift and saturate more gently so they stay neutral.
  const shiftScale = midtone.isNeutral ? 0.6 : 1;
  const saturationShiftScale = midtone.isNeutral ? 0.35 : 1;

  const tones: ToneDraft[] = [];
  for (let shadowStep = settings.shadowStepCount; shadowStep >= 1; shadowStep--) {
    const hue = rotateHueToward(midtone.base.hue, settings.shadowHue, settings.hueShiftPerStep * shadowStep * shiftScale);
    const saturation = clampUnit(midtone.base.saturation + settings.saturationShiftPerStep * shadowStep * saturationShiftScale);
    const targetValue = midtoneValue - shadowValueStep * shadowStep;
    const hex = hsbToHex(solveHsbForValue(hue, saturation, targetValue));
    tones.push({ hex, value: hexPerceivedValue(hex), role: "shadow", rampIndex: midtone.rampIndex, positionInRamp: 0 });
  }
  const midtonePosition = tones.length;
  tones.push({ hex: baseHex, value: midtoneValue, role: "midtone", rampIndex: midtone.rampIndex, positionInRamp: 0 });
  for (let lightStep = 1; lightStep <= settings.lightStepCount; lightStep++) {
    const hue = rotateHueToward(midtone.base.hue, settings.lightHue, settings.hueShiftPerStep * lightStep * shiftScale);
    const saturation = clampUnit(midtone.base.saturation - settings.saturationShiftPerStep * lightStep * saturationShiftScale);
    const targetValue = midtoneValue + lightValueStep * lightStep;
    const hex = hsbToHex(solveHsbForValue(hue, saturation, targetValue));
    tones.push({ hex, value: hexPerceivedValue(hex), role: "light", rampIndex: midtone.rampIndex, positionInRamp: 0 });
  }
  tones.forEach((tone, position) => (tone.positionInRamp = position));

  return {
    rampIndex: midtone.rampIndex,
    label: midtone.label,
    isNeutral: midtone.isNeutral,
    locked: midtone.locked,
    baseHex,
    tones,
    midtonePosition,
  };
}

/** Minimal union-find over tone ids, tracking which ramps each group touches. */
class BridgeGroups {
  private parentOf: number[];
  private rampsInGroup: Set<number>[];
  constructor(rampIndexPerMember: (number | null)[]) {
    this.parentOf = rampIndexPerMember.map((_, memberIndex) => memberIndex);
    this.rampsInGroup = rampIndexPerMember.map((rampIndex) => new Set(rampIndex === null ? [] : [rampIndex]));
  }
  root(memberIndex: number): number {
    while (this.parentOf[memberIndex] !== memberIndex) {
      this.parentOf[memberIndex] = this.parentOf[this.parentOf[memberIndex]];
      memberIndex = this.parentOf[memberIndex];
    }
    return memberIndex;
  }
  /** Joins two groups unless that would put two tones of the same ramp together. */
  tryJoin(firstMember: number, secondMember: number): boolean {
    const firstRoot = this.root(firstMember);
    const secondRoot = this.root(secondMember);
    if (firstRoot === secondRoot) return false;
    for (const rampIndex of this.rampsInGroup[secondRoot]) {
      if (this.rampsInGroup[firstRoot].has(rampIndex)) return false;
    }
    this.parentOf[secondRoot] = firstRoot;
    for (const rampIndex of this.rampsInGroup[secondRoot]) this.rampsInGroup[firstRoot].add(rampIndex);
    return true;
  }
}

export function generatePalette(recipe: PaletteRecipe): GeneratedPalette {
  const { settings } = recipe;
  const warnings: PaletteWarning[] = [];
  const midtones = resolveMidtones(recipe);
  const rampDrafts = midtones.map((midtone) => buildRamp(settings, midtone, warnings));

  // Shared binding colors: a tinted near-black and a tinted near-white.
  const sharedShadowHex = settings.includeSharedShadow
    ? hsbToHex(solveHsbForValue(settings.shadowHue, 0.5, sharedShadowValue))
    : null;
  const sharedHighlightHex = settings.includeSharedHighlight
    ? hsbToHex(solveHsbForValue(settings.lightHue, 0.12, sharedHighlightValue))
    : null;

  // Flatten every tone into one list of "members" so bridging can merge across ramps.
  interface Member { hex: string; role: ColorRole; rampIndex: number | null; rampPosition: number; locked: boolean }
  const members: Member[] = [];
  if (sharedShadowHex) members.push({ hex: sharedShadowHex, role: "shared-shadow", rampIndex: null, rampPosition: -1, locked: true });
  if (sharedHighlightHex) members.push({ hex: sharedHighlightHex, role: "shared-highlight", rampIndex: null, rampPosition: -1, locked: true });
  for (const ramp of rampDrafts) {
    for (const tone of ramp.tones) {
      members.push({ hex: tone.hex, role: tone.role, rampIndex: ramp.rampIndex, rampPosition: tone.positionInRamp, locked: false });
    }
  }

  const groups = new BridgeGroups(members.map((member) => member.rampIndex));
  if (settings.bridgingEnabled) {
    const candidatePairs: { firstMember: number; secondMember: number; distance: number }[] = [];
    for (let firstMember = 0; firstMember < members.length; firstMember++) {
      for (let secondMember = firstMember + 1; secondMember < members.length; secondMember++) {
        const first = members[firstMember];
        const second = members[secondMember];
        if (first.rampIndex !== null && first.rampIndex === second.rampIndex) continue;
        if (first.rampIndex === null && second.rampIndex === null) continue;
        if (settings.bridgingProtectsMidtones && (first.role === "midtone" || second.role === "midtone")) continue;
        const distance = perceptualDistance(hexToRgb(first.hex), hexToRgb(second.hex));
        if (distance < settings.bridgingThreshold) candidatePairs.push({ firstMember, secondMember, distance });
      }
    }
    // closest pairs first, like eyeballing the most similar swatches
    candidatePairs.sort((firstPair, secondPair) => firstPair.distance - secondPair.distance);
    for (const pair of candidatePairs) groups.tryJoin(pair.firstMember, pair.secondMember);
  }

  // Collapse each group into one palette color.
  const memberIndicesByRoot = new Map<number, number[]>();
  members.forEach((_, memberIndex) => {
    const groupRoot = groups.root(memberIndex);
    memberIndicesByRoot.set(groupRoot, [...(memberIndicesByRoot.get(groupRoot) ?? []), memberIndex]);
  });

  const colors: PaletteColor[] = [];
  const colorIndexByMember: number[] = new Array(members.length);
  let sharedShadowColorIndex: number | null = null;
  let sharedHighlightColorIndex: number | null = null;

  for (const groupMemberIndices of memberIndicesByRoot.values()) {
    const groupMembers = groupMemberIndices.map((memberIndex) => members[memberIndex]);
    // Shared colors and midtones are anchors: if present, the group takes their exact color.
    const anchorMember =
      groupMembers.find((member) => member.role === "shared-shadow" || member.role === "shared-highlight") ??
      groupMembers.find((member) => member.role === "midtone");
    const hex = anchorMember
      ? anchorMember.hex
      : normalizeHex(averageToHex(groupMembers.map((member) => member.hex)));
    const role: ColorRole = anchorMember ? anchorMember.role : groupMembers.length > 1 ? "bridged" : groupMembers[0].role;
    const colorIndex = colors.length;
    colors.push({
      hex,
      value: hexPerceivedValue(hex),
      role,
      usedByRampIndices: [...new Set(groupMembers.flatMap((member) => (member.rampIndex === null ? [] : [member.rampIndex])))],
    });
    for (const memberIndex of groupMemberIndices) colorIndexByMember[memberIndex] = colorIndex;
    if (groupMembers.some((member) => member.role === "shared-shadow")) sharedShadowColorIndex = colorIndex;
    if (groupMembers.some((member) => member.role === "shared-highlight")) sharedHighlightColorIndex = colorIndex;
  }

  // Shared colors are used by every ramp.
  const allRampIndices = rampDrafts.map((ramp) => ramp.rampIndex);
  if (sharedShadowColorIndex !== null) colors[sharedShadowColorIndex].usedByRampIndices = allRampIndices;
  if (sharedHighlightColorIndex !== null) colors[sharedHighlightColorIndex].usedByRampIndices = allRampIndices;

  const ramps: GeneratedRamp[] = rampDrafts.map((ramp) => ({
    rampIndex: ramp.rampIndex,
    label: ramp.label,
    isNeutral: ramp.isNeutral,
    locked: ramp.locked,
    baseHex: ramp.baseHex,
    midtonePosition: ramp.midtonePosition,
    toneColorIndices: ramp.tones.map((tone) => {
      const memberIndex = members.findIndex(
        (member) => member.rampIndex === ramp.rampIndex && member.rampPosition === tone.positionInRamp,
      );
      return colorIndexByMember[memberIndex];
    }),
  }));

  // Value check: neighbouring tones that are too close in value blend together.
  for (const ramp of ramps) {
    const fullRampValues = [
      ...(sharedShadowColorIndex !== null ? [colors[sharedShadowColorIndex].value] : []),
      ...ramp.toneColorIndices.map((colorIndex) => colors[colorIndex].value),
      ...(sharedHighlightColorIndex !== null ? [colors[sharedHighlightColorIndex].value] : []),
    ];
    for (let position = 1; position < fullRampValues.length; position++) {
      const valueGap = fullRampValues[position] - fullRampValues[position - 1];
      if (Math.abs(valueGap) < settings.minimumValueContrast) {
        warnings.push({
          kind: "value-blend",
          message: `${ramp.label}: two neighbouring tones are only ${Math.round(Math.abs(valueGap) * 100)} value points apart, so they'll blend. Raise the value step or use fewer tones.`,
        });
        break;
      }
    }
  }

  if (colors.length > 30) {
    warnings.push({
      kind: "procreate-limit",
      message: `${colors.length} colors: a Procreate palette holds 30, so the export will be cut off. Reduce ramps/tones or enable bridging.`,
    });
  }

  if (!settings.bridgingEnabled) {
    let nearDuplicatePairCount = 0;
    for (let firstIndex = 0; firstIndex < colors.length; firstIndex++) {
      for (let secondIndex = firstIndex + 1; secondIndex < colors.length; secondIndex++) {
        if (perceptualDistance(hexToRgb(colors[firstIndex].hex), hexToRgb(colors[secondIndex].hex)) < 0.035) nearDuplicatePairCount++;
      }
    }
    if (nearDuplicatePairCount > 0) {
      warnings.push({
        kind: "near-duplicate",
        message: `${nearDuplicatePairCount} pair${nearDuplicatePairCount > 1 ? "s" : ""} of colors look nearly identical. Turn on bridging to merge them.`,
      });
    }
  }

  return { colors, ramps, sharedShadowColorIndex, sharedHighlightColorIndex, warnings };
}

function averageToHex(hexes: string[]): string {
  const average = averageColorsPerceptually(hexes.map(hexToRgb));
  const toHexPair = (channel: number) => Math.round(clampUnit(channel) * 255).toString(16).padStart(2, "0");
  return `#${toHexPair(average.red)}${toHexPair(average.green)}${toHexPair(average.blue)}`;
}

/**
 * Colors in a sensible export order: shared shadow, each ramp dark → light,
 * shared highlight. Bridged colors appear once, at their first use.
 */
export function orderedUniqueColorIndices(palette: GeneratedPalette): number[] {
  const orderedIndices: number[] = [];
  const pushOnce = (colorIndex: number | null) => {
    if (colorIndex !== null && !orderedIndices.includes(colorIndex)) orderedIndices.push(colorIndex);
  };
  pushOnce(palette.sharedShadowColorIndex);
  for (const ramp of palette.ramps) {
    for (const colorIndex of ramp.toneColorIndices) {
      if (colorIndex !== palette.sharedHighlightColorIndex) pushOnce(colorIndex);
    }
  }
  pushOnce(palette.sharedHighlightColorIndex);
  palette.colors.forEach((_, colorIndex) => pushOnce(colorIndex));
  return orderedIndices;
}

/** Same recipe, but with hue/saturation shifting turned off — the book's "murky" comparison. */
export function withoutHueShifting(recipe: PaletteRecipe): PaletteRecipe {
  return {
    ...recipe,
    settings: { ...recipe.settings, hueShiftPerStep: 0, saturationShiftPerStep: 0, bridgingEnabled: false },
  };
}
