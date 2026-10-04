/**
 * Everything that shapes a palette. A "recipe" (seed + settings + per-ramp
 * overrides) fully determines the output, so recipes are what get saved,
 * shared in the URL, and undone.
 */

export type HarmonyScheme =
  | "spread"
  | "monochrome"
  | "analogous"
  | "complementary"
  | "split-complementary"
  | "triadic"
  | "square";

export interface PaletteSettings {
  /** number of chromatic ramps (base colors), not counting the neutral ramp */
  rampCount: number;
  /** tones darker than the midtone in each ramp */
  shadowStepCount: number;
  /** tones lighter than the midtone in each ramp */
  lightStepCount: number;
  harmony: HarmonyScheme;

  /** HSB saturation range the random midtones are drawn from */
  baseSaturationMinimum: number;
  baseSaturationMaximum: number;
  /** perceptual value (OKLab L, 0..1) range for the random midtones */
  baseValueMinimum: number;
  baseValueMaximum: number;
  /** preferred perceptual-value gap between neighbouring tones in a ramp */
  valueStep: number;

  /** hue the light tones lean toward (sunlight → yellow) */
  lightHue: number;
  /** hue the shadow tones lean toward (skylight → blue) */
  shadowHue: number;
  /** degrees of hue rotation per step away from the midtone */
  hueShiftPerStep: number;
  /** HSB saturation removed per light step / added per shadow step */
  saturationShiftPerStep: number;

  /** a near-black that every ramp shares as its darkest color (outlines) */
  includeSharedShadow: boolean;
  /** a near-white that every ramp shares as its brightest color */
  includeSharedHighlight: boolean;
  /** a low-saturation ramp for metal, cloth, stone, grays */
  includeNeutralRamp: boolean;

  /** merge colors from different ramps that look nearly identical */
  bridgingEnabled: boolean;
  /** OKLab distance under which two colors get bridged */
  bridgingThreshold: number;
  /** never move the chosen midtones when bridging */
  bridgingProtectsMidtones: boolean;

  /** neighbouring tones closer than this (OKLab L) get flagged as blending */
  minimumValueContrast: number;
}

export interface RampOverride {
  /** a fixed midtone (hex). Absent → seeded random */
  baseHex?: string;
  /** locked ramps survive "remix" */
  locked?: boolean;
  label?: string;
}

export interface PaletteRecipe {
  seed: string;
  settings: PaletteSettings;
  /** keyed by ramp index; the neutral ramp uses neutralRampOverrideKey (16) */
  overrides: Record<number, RampOverride>;
}

export type StylePresetName = "cartoony" | "balanced" | "realistic";

/**
 * The book: cartoony art uses bright, saturated colors with very few tones
 * (one light, one shadow); realistic art uses desaturated colors with plenty
 * of tones. Hue shifting is more pronounced on simple shapes, subtler on
 * busy textures.
 */
export const stylePresets: Record<StylePresetName, { label: string; description: string; settings: Partial<PaletteSettings> }> = {
  cartoony: {
    label: "Cartoony",
    description: "Bright, saturated, one light + one shadow. Fast to animate.",
    settings: {
      shadowStepCount: 1,
      lightStepCount: 1,
      baseSaturationMinimum: 0.6,
      baseSaturationMaximum: 0.88,
      baseValueMinimum: 0.55,
      baseValueMaximum: 0.75,
      valueStep: 0.17,
      hueShiftPerStep: 22,
      saturationShiftPerStep: 0.12,
    },
  },
  balanced: {
    label: "Balanced",
    description: "Two lights, two shadows, moderate saturation.",
    settings: {
      shadowStepCount: 2,
      lightStepCount: 2,
      baseSaturationMinimum: 0.42,
      baseSaturationMaximum: 0.72,
      baseValueMinimum: 0.5,
      baseValueMaximum: 0.68,
      valueStep: 0.12,
      hueShiftPerStep: 14,
      saturationShiftPerStep: 0.08,
    },
  },
  realistic: {
    label: "Realistic",
    description: "Desaturated with more tones, for a serious mood.",
    settings: {
      shadowStepCount: 3,
      lightStepCount: 2,
      baseSaturationMinimum: 0.22,
      baseSaturationMaximum: 0.5,
      baseValueMinimum: 0.5,
      baseValueMaximum: 0.66,
      valueStep: 0.095,
      hueShiftPerStep: 9,
      saturationShiftPerStep: 0.05,
    },
  },
};

export interface LightingPreset {
  label: string;
  description: string;
  lightHue: number;
  shadowHue: number;
}

/**
 * The book's default reasoning: the sun is the light source so lights pick up
 * yellow, and shadows pick up blue from the sky. Other scenes have other
 * light sources — same rule, different targets.
 */
export const lightingPresets: Record<string, LightingPreset> = {
  sunlight: { label: "Sunlight", description: "Lights → yellow, shadows → sky blue (the book's default)", lightHue: 55, shadowHue: 235 },
  goldenHour: { label: "Golden hour", description: "Lights → orange, shadows → violet", lightHue: 35, shadowHue: 265 },
  moonlight: { label: "Moonlight", description: "Lights → pale cyan, shadows → deep indigo", lightHue: 185, shadowHue: 250 },
  firelight: { label: "Firelight", description: "Lights → orange, shadows → wine/purple", lightHue: 28, shadowHue: 295 },
  canopy: { label: "Forest canopy", description: "Lights → yellow-green, shadows → teal", lightHue: 75, shadowHue: 195 },
  neon: { label: "Neon", description: "Lights → hot pink, shadows → cyan-blue", lightHue: 320, shadowHue: 210 },
};

export const harmonyLabels: Record<HarmonyScheme, string> = {
  spread: "Spread (golden angle)",
  monochrome: "Monochrome",
  analogous: "Analogous",
  complementary: "Complementary",
  "split-complementary": "Split complementary",
  triadic: "Triadic",
  square: "Square (tetradic)",
};

export const defaultSettings: PaletteSettings = {
  rampCount: 4,
  harmony: "spread",
  shadowStepCount: 2,
  lightStepCount: 2,
  baseSaturationMinimum: 0.42,
  baseSaturationMaximum: 0.72,
  baseValueMinimum: 0.5,
  baseValueMaximum: 0.68,
  valueStep: 0.12,
  hueShiftPerStep: 14,
  saturationShiftPerStep: 0.08,
  lightHue: lightingPresets.sunlight.lightHue,
  shadowHue: lightingPresets.sunlight.shadowHue,
  includeSharedShadow: true,
  includeSharedHighlight: true,
  includeNeutralRamp: true,
  bridgingEnabled: true,
  bridgingThreshold: 0.065,
  bridgingProtectsMidtones: true,
  minimumValueContrast: 0.05,
};

export const settingLimits = {
  rampCount: { minimum: 1, maximum: 8 },
  stepCount: { minimum: 0, maximum: 4 },
};

/** Fill in any missing/invalid settings (old saves, hand-edited JSON, URL state). */
export function sanitizeSettings(candidate: Partial<PaletteSettings> | undefined): PaletteSettings {
  const merged = { ...defaultSettings, ...(candidate ?? {}) } as PaletteSettings;
  for (const key of Object.keys(defaultSettings) as (keyof PaletteSettings)[]) {
    if (typeof merged[key] !== typeof defaultSettings[key]) {
      (merged as unknown as Record<string, unknown>)[key] = defaultSettings[key];
    }
  }
  const clampInteger = (value: number, minimum: number, maximum: number) =>
    Math.min(maximum, Math.max(minimum, Math.round(value)));
  merged.rampCount = clampInteger(merged.rampCount, settingLimits.rampCount.minimum, settingLimits.rampCount.maximum);
  merged.shadowStepCount = clampInteger(merged.shadowStepCount, 0, settingLimits.stepCount.maximum);
  merged.lightStepCount = clampInteger(merged.lightStepCount, 0, settingLimits.stepCount.maximum);
  if (!(merged.harmony in harmonyLabels)) merged.harmony = defaultSettings.harmony;
  return merged;
}
