/**
 * Color conversions.
 *
 * The book defines colors with hue / saturation / brightness (HSB, the model
 * every color picker exposes), but it is careful to say that *value* — how
 * light a color looks to a human — is not the same as HSB brightness: a fully
 * bright yellow reads much lighter than a fully bright blue.
 *
 * So rampart works in two models at once:
 *   - HSB for the moves the book describes (shift hue, raise/lower saturation)
 *   - OKLab lightness (L, 0..1) as the perceptual "value" we target and check
 */

/** sRGB channels in 0..1 */
export interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

/** hue in degrees 0..360, saturation and brightness in 0..1 */
export interface HsbColor {
  hue: number;
  saturation: number;
  brightness: number;
}

export interface OklabColor {
  lightness: number;
  greenRedAxis: number;
  blueYellowAxis: number;
}

export const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

export const wrapHueDegrees = (hueDegrees: number): number => ((hueDegrees % 360) + 360) % 360;

export function hsbToRgb({ hue, saturation, brightness }: HsbColor): RgbColor {
  const wrappedHue = wrapHueDegrees(hue) / 60;
  const chroma = brightness * saturation;
  const secondComponent = chroma * (1 - Math.abs((wrappedHue % 2) - 1));
  const lightnessMatch = brightness - chroma;
  let redPrime = 0;
  let greenPrime = 0;
  let bluePrime = 0;
  if (wrappedHue < 1) [redPrime, greenPrime, bluePrime] = [chroma, secondComponent, 0];
  else if (wrappedHue < 2) [redPrime, greenPrime, bluePrime] = [secondComponent, chroma, 0];
  else if (wrappedHue < 3) [redPrime, greenPrime, bluePrime] = [0, chroma, secondComponent];
  else if (wrappedHue < 4) [redPrime, greenPrime, bluePrime] = [0, secondComponent, chroma];
  else if (wrappedHue < 5) [redPrime, greenPrime, bluePrime] = [secondComponent, 0, chroma];
  else [redPrime, greenPrime, bluePrime] = [chroma, 0, secondComponent];
  return {
    red: redPrime + lightnessMatch,
    green: greenPrime + lightnessMatch,
    blue: bluePrime + lightnessMatch,
  };
}

export function rgbToHsb({ red, green, blue }: RgbColor): HsbColor {
  const maximumChannel = Math.max(red, green, blue);
  const minimumChannel = Math.min(red, green, blue);
  const channelSpread = maximumChannel - minimumChannel;
  let hue = 0;
  if (channelSpread > 0) {
    if (maximumChannel === red) hue = 60 * (((green - blue) / channelSpread) % 6);
    else if (maximumChannel === green) hue = 60 * ((blue - red) / channelSpread + 2);
    else hue = 60 * ((red - green) / channelSpread + 4);
  }
  return {
    hue: wrapHueDegrees(hue),
    saturation: maximumChannel === 0 ? 0 : channelSpread / maximumChannel,
    brightness: maximumChannel,
  };
}

const srgbChannelToLinear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);

const linearChannelToSrgb = (channel: number): number =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;

export function rgbToOklab({ red, green, blue }: RgbColor): OklabColor {
  const linearRed = srgbChannelToLinear(red);
  const linearGreen = srgbChannelToLinear(green);
  const linearBlue = srgbChannelToLinear(blue);
  const longCone = Math.cbrt(0.4122214708 * linearRed + 0.5363325363 * linearGreen + 0.0514459929 * linearBlue);
  const mediumCone = Math.cbrt(0.2119034982 * linearRed + 0.6806995451 * linearGreen + 0.1073969566 * linearBlue);
  const shortCone = Math.cbrt(0.0883024619 * linearRed + 0.2817188376 * linearGreen + 0.6299787005 * linearBlue);
  return {
    lightness: 0.2104542553 * longCone + 0.793617785 * mediumCone - 0.0040720468 * shortCone,
    greenRedAxis: 1.9779984951 * longCone - 2.428592205 * mediumCone + 0.4505937099 * shortCone,
    blueYellowAxis: 0.0259040371 * longCone + 0.7827717662 * mediumCone - 0.808675766 * shortCone,
  };
}

export function oklabToRgb({ lightness, greenRedAxis, blueYellowAxis }: OklabColor): RgbColor {
  const longCone = Math.pow(lightness + 0.3963377774 * greenRedAxis + 0.2158037573 * blueYellowAxis, 3);
  const mediumCone = Math.pow(lightness - 0.1055613458 * greenRedAxis - 0.0638541728 * blueYellowAxis, 3);
  const shortCone = Math.pow(lightness - 0.0894841775 * greenRedAxis - 1.291485548 * blueYellowAxis, 3);
  return {
    red: clampUnit(linearChannelToSrgb(4.0767416621 * longCone - 3.3077115913 * mediumCone + 0.2309699292 * shortCone)),
    green: clampUnit(linearChannelToSrgb(-1.2684380046 * longCone + 2.6097574011 * mediumCone - 0.3413193965 * shortCone)),
    blue: clampUnit(linearChannelToSrgb(-0.0041960863 * longCone - 0.7034186147 * mediumCone + 1.707614701 * shortCone)),
  };
}

/** Perceptual value of a color, 0 (black) .. 1 (white). */
export const perceivedValue = (rgb: RgbColor): number => rgbToOklab(rgb).lightness;

/** Distance between two colors in OKLab — roughly "how different do these look". */
export function perceptualDistance(firstColor: RgbColor, secondColor: RgbColor): number {
  const firstLab = rgbToOklab(firstColor);
  const secondLab = rgbToOklab(secondColor);
  return Math.hypot(
    firstLab.lightness - secondLab.lightness,
    firstLab.greenRedAxis - secondLab.greenRedAxis,
    firstLab.blueYellowAxis - secondLab.blueYellowAxis,
  );
}

/** The neutral gray that has exactly the given perceptual value. Used for the "turn it black and white" check. */
export function grayForPerceivedValue(value: number): RgbColor {
  const grayChannel = clampUnit(linearChannelToSrgb(Math.pow(clampUnit(value), 3)));
  return { red: grayChannel, green: grayChannel, blue: grayChannel };
}

export function rgbToHex({ red, green, blue }: RgbColor): string {
  const toHexPair = (channel: number) => Math.round(clampUnit(channel) * 255).toString(16).padStart(2, "0");
  return `#${toHexPair(red)}${toHexPair(green)}${toHexPair(blue)}`;
}

export function isValidHex(candidate: string): boolean {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(candidate.trim());
}

export function normalizeHex(candidate: string): string {
  let digits = candidate.trim().replace(/^#/, "").toLowerCase();
  if (digits.length === 3) digits = digits.split("").map((digit) => digit + digit).join("");
  return `#${digits}`;
}

export function hexToRgb(hex: string): RgbColor {
  const digits = normalizeHex(hex).slice(1);
  return {
    red: parseInt(digits.slice(0, 2), 16) / 255,
    green: parseInt(digits.slice(2, 4), 16) / 255,
    blue: parseInt(digits.slice(4, 6), 16) / 255,
  };
}

export const hexToHsb = (hex: string): HsbColor => rgbToHsb(hexToRgb(hex));
export const hsbToHex = (hsb: HsbColor): string => rgbToHex(hsbToRgb(hsb));
export const hexPerceivedValue = (hex: string): number => perceivedValue(hexToRgb(hex));

/** Signed shortest angular distance from one hue to another, in degrees (-180..180]. */
export function signedHueDistance(fromHue: number, toHue: number): number {
  const difference = wrapHueDegrees(toHue - fromHue);
  return difference > 180 ? difference - 360 : difference;
}

/**
 * Rotate a hue toward a target hue by up to `maximumDegrees`, along the
 * shortest arc, never overshooting the target. This is the core "hue shift".
 */
export function rotateHueToward(fromHue: number, towardHue: number, maximumDegrees: number): number {
  const distance = signedHueDistance(fromHue, towardHue);
  const appliedRotation = Math.sign(distance) * Math.min(Math.abs(distance), Math.max(0, maximumDegrees));
  return wrapHueDegrees(fromHue + appliedRotation);
}

/**
 * Find the HSB color with the given hue and (preferred) saturation whose
 * perceived value matches `targetValue`. Brightness is solved by bisection
 * (value rises monotonically with brightness at fixed hue/saturation).
 * If even full brightness is too dark — e.g. a saturated blue can never look
 * as light as a pale tone — saturation is reduced until it fits, which is
 * exactly what the book's "lights lose saturation" rule wants anyway.
 */
export function solveHsbForValue(hue: number, preferredSaturation: number, targetValue: number): HsbColor {
  const clampedTarget = clampUnit(targetValue);
  let saturation = clampUnit(preferredSaturation);
  const valueAtFullBrightness = (candidateSaturation: number) =>
    perceivedValue(hsbToRgb({ hue, saturation: candidateSaturation, brightness: 1 }));

  if (valueAtFullBrightness(saturation) < clampedTarget) {
    let lowSaturation = 0;
    let highSaturation = saturation;
    for (let iteration = 0; iteration < 30; iteration++) {
      const middleSaturation = (lowSaturation + highSaturation) / 2;
      if (valueAtFullBrightness(middleSaturation) >= clampedTarget) lowSaturation = middleSaturation;
      else highSaturation = middleSaturation;
    }
    saturation = lowSaturation;
  }

  let lowBrightness = 0;
  let highBrightness = 1;
  for (let iteration = 0; iteration < 40; iteration++) {
    const middleBrightness = (lowBrightness + highBrightness) / 2;
    if (perceivedValue(hsbToRgb({ hue, saturation, brightness: middleBrightness })) < clampedTarget) {
      lowBrightness = middleBrightness;
    } else {
      highBrightness = middleBrightness;
    }
  }
  return { hue: wrapHueDegrees(hue), saturation, brightness: (lowBrightness + highBrightness) / 2 };
}

export function averageColorsPerceptually(colors: RgbColor[], weights?: number[]): RgbColor {
  let totalWeight = 0;
  let lightnessSum = 0;
  let greenRedSum = 0;
  let blueYellowSum = 0;
  colors.forEach((color, colorIndex) => {
    const weight = weights?.[colorIndex] ?? 1;
    const lab = rgbToOklab(color);
    totalWeight += weight;
    lightnessSum += lab.lightness * weight;
    greenRedSum += lab.greenRedAxis * weight;
    blueYellowSum += lab.blueYellowAxis * weight;
  });
  return oklabToRgb({
    lightness: lightnessSum / totalWeight,
    greenRedAxis: greenRedSum / totalWeight,
    blueYellowAxis: blueYellowSum / totalWeight,
  });
}
