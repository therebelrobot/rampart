/**
 * Optional: pull midtones out of a reference image. Only the *base colors*
 * come from the image — the ramps around them are still built with the
 * book's value + hue-shifting rules.
 *
 * k-means in OKLab on a downsampled copy. Near-black and near-white pixels are
 * skipped (outlines and backgrounds would otherwise dominate), and pixels are
 * weighted by chroma so colorful areas win over large gray ones.
 */

import { oklabToRgb, rgbToHex, rgbToOklab, type OklabColor } from "./convert";
import { createRandomSource } from "./random";

const maximumSampleEdge = 96;

export async function extractMidtonesFromImage(imageFile: File, clusterCount: number): Promise<string[]> {
  const bitmap = await createImageBitmap(imageFile);
  const scale = Math.min(1, maximumSampleEdge / Math.max(bitmap.width, bitmap.height));
  const sampleWidth = Math.max(1, Math.round(bitmap.width * scale));
  const sampleHeight = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
  bitmap.close();
  const pixelBytes = context.getImageData(0, 0, sampleWidth, sampleHeight).data;

  const samples: { lab: OklabColor; weight: number }[] = [];
  for (let byteOffset = 0; byteOffset < pixelBytes.length; byteOffset += 4) {
    if (pixelBytes[byteOffset + 3] < 128) continue;
    const lab = rgbToOklab({
      red: pixelBytes[byteOffset] / 255,
      green: pixelBytes[byteOffset + 1] / 255,
      blue: pixelBytes[byteOffset + 2] / 255,
    });
    if (lab.lightness < 0.22 || lab.lightness > 0.94) continue;
    const chroma = Math.hypot(lab.greenRedAxis, lab.blueYellowAxis);
    samples.push({ lab, weight: 0.1 + chroma * 12 });
  }
  if (samples.length === 0) throw new Error("No usable mid-value pixels found in that image.");

  return clusterSamples(samples, Math.min(clusterCount, samples.length)).map((lab) => rgbToHex(oklabToRgb(lab)));
}

function clusterSamples(samples: { lab: OklabColor; weight: number }[], clusterCount: number): OklabColor[] {
  const random = createRandomSource(`extract#${samples.length}`);
  const distanceSquared = (first: OklabColor, second: OklabColor) =>
    (first.lightness - second.lightness) ** 2 +
    (first.greenRedAxis - second.greenRedAxis) ** 2 +
    (first.blueYellowAxis - second.blueYellowAxis) ** 2;

  // k-means++ initialisation
  const centers: OklabColor[] = [samples[Math.floor(random() * samples.length)].lab];
  while (centers.length < clusterCount) {
    const nearestDistances = samples.map((sample) =>
      Math.min(...centers.map((center) => distanceSquared(sample.lab, center))) * sample.weight);
    const totalDistance = nearestDistances.reduce((sum, distance) => sum + distance, 0);
    let pick = random() * totalDistance;
    let chosenIndex = 0;
    for (; chosenIndex < nearestDistances.length - 1; chosenIndex++) {
      pick -= nearestDistances[chosenIndex];
      if (pick <= 0) break;
    }
    centers.push(samples[chosenIndex].lab);
  }

  let clusterWeights = new Array(clusterCount).fill(0);
  for (let iteration = 0; iteration < 14; iteration++) {
    const sums = centers.map(() => ({ lightness: 0, greenRedAxis: 0, blueYellowAxis: 0, weight: 0 }));
    for (const sample of samples) {
      let nearestCenter = 0;
      let nearestDistance = Infinity;
      centers.forEach((center, centerIndex) => {
        const distance = distanceSquared(sample.lab, center);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestCenter = centerIndex;
        }
      });
      const sum = sums[nearestCenter];
      sum.lightness += sample.lab.lightness * sample.weight;
      sum.greenRedAxis += sample.lab.greenRedAxis * sample.weight;
      sum.blueYellowAxis += sample.lab.blueYellowAxis * sample.weight;
      sum.weight += sample.weight;
    }
    sums.forEach((sum, centerIndex) => {
      if (sum.weight > 0) {
        centers[centerIndex] = {
          lightness: sum.lightness / sum.weight,
          greenRedAxis: sum.greenRedAxis / sum.weight,
          blueYellowAxis: sum.blueYellowAxis / sum.weight,
        };
      }
    });
    clusterWeights = sums.map((sum) => sum.weight);
  }

  return centers
    .map((center, centerIndex) => ({ center, weight: clusterWeights[centerIndex] }))
    .sort((first, second) => second.weight - first.weight)
    .map((entry) => entry.center);
}
