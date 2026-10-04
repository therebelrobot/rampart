/**
 * Canvas drawing: the swatch cross (for PNG export), a 1px-per-color palette
 * strip (Aseprite / Lospec style), and little shaded test spheres like the
 * book's hue-shifting examples.
 */

import { grayForPerceivedValue, hexPerceivedValue, rgbToHex } from "../color/convert";
import type { GeneratedPalette } from "../color/generate";
import { layoutSwatchCross } from "./layout";

export type HexMapper = (hex: string) => string;
export const identityHex: HexMapper = (hex) => hex;
export const toValueGray: HexMapper = (hex) => rgbToHex(grayForPerceivedValue(hexPerceivedValue(hex)));

export function drawSwatchCross(palette: GeneratedPalette, cellSize: number, frameColor = "#141418"): HTMLCanvasElement {
  const layout = layoutSwatchCross(palette);
  const frameWidth = Math.max(2, Math.round(cellSize / 8));
  const canvas = document.createElement("canvas");
  canvas.width = layout.columnCount * cellSize + frameWidth * 2;
  canvas.height = layout.rowCount * cellSize + frameWidth * 2;
  const context = canvas.getContext("2d")!;

  // frame around the key row, like the book's diagrams
  context.fillStyle = frameColor;
  context.fillRect(0, layout.keyRow * cellSize, canvas.width, cellSize + frameWidth * 2);

  for (const cell of layout.cells) {
    context.fillStyle = palette.colors[cell.colorIndex].hex;
    const verticalOffset = cell.row > layout.keyRow ? frameWidth * 2 : cell.row === layout.keyRow ? frameWidth : 0;
    context.fillRect(frameWidth + cell.column * cellSize, cell.row * cellSize + verticalOffset, cellSize, cellSize);
  }
  return canvas;
}

export function drawPaletteStrip(hexColors: string[], pixelSize = 1): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = hexColors.length * pixelSize;
  canvas.height = pixelSize;
  const context = canvas.getContext("2d")!;
  hexColors.forEach((hex, colorPosition) => {
    context.fillStyle = hex;
    context.fillRect(colorPosition * pixelSize, 0, pixelSize, pixelSize);
  });
  return canvas;
}

export const sphereCanvasSize = { width: 34, height: 36 };

/**
 * A pixel-art sphere lit from the top-left: tones are banded by diffuse light
 * (dark → light), with an outline, a specular highlight, a touch of bounce
 * light on the shadow side, and a cast shadow on the ground.
 */
export function drawShadedSphere(
  canvas: HTMLCanvasElement,
  toneHexesDarkToLight: string[],
  outlineHex: string,
  specularHex: string,
  backgroundHex: string,
  groundShadowHex: string,
): void {
  canvas.width = sphereCanvasSize.width;
  canvas.height = sphereCanvasSize.height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = backgroundHex;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const centerX = 17;
  const centerY = 15;
  const radius = 12;
  const lightLength = Math.hypot(-0.55, -0.7, 0.6);
  const light = { x: -0.55 / lightLength, y: -0.7 / lightLength, z: 0.6 / lightLength };
  const toneCount = toneHexesDarkToLight.length;

  const isInside = (pixelX: number, pixelY: number) =>
    Math.hypot(pixelX + 0.5 - centerX, pixelY + 0.5 - centerY) <= radius;

  // cast shadow
  context.fillStyle = groundShadowHex;
  for (let pixelY = 28; pixelY <= 32; pixelY++) {
    for (let pixelX = 0; pixelX < canvas.width; pixelX++) {
      const ellipse = ((pixelX + 0.5 - (centerX + 2)) / 11) ** 2 + ((pixelY + 0.5 - 30) / 2.6) ** 2;
      if (ellipse <= 1) context.fillRect(pixelX, pixelY, 1, 1);
    }
  }

  for (let pixelY = 0; pixelY < canvas.height; pixelY++) {
    for (let pixelX = 0; pixelX < canvas.width; pixelX++) {
      if (!isInside(pixelX, pixelY)) {
        const touchesSphere =
          isInside(pixelX + 1, pixelY) || isInside(pixelX - 1, pixelY) ||
          isInside(pixelX, pixelY + 1) || isInside(pixelX, pixelY - 1);
        if (touchesSphere) {
          context.fillStyle = outlineHex;
          context.fillRect(pixelX, pixelY, 1, 1);
        }
        continue;
      }
      const normalX = (pixelX + 0.5 - centerX) / radius;
      const normalY = (pixelY + 0.5 - centerY) / radius;
      const normalZ = Math.sqrt(Math.max(0, 1 - normalX * normalX - normalY * normalY));
      const diffuse = Math.max(0, normalX * light.x + normalY * light.y + normalZ * light.z);
      let toneIndex = Math.min(toneCount - 1, Math.floor(Math.pow(diffuse, 0.85) * toneCount));
      // bounce light along the bottom-right rim of the shadow side
      if (diffuse < 0.12 && normalZ < 0.45 && normalX + normalY > 0.9 && toneCount > 2) toneIndex = Math.min(toneIndex + 1, toneCount - 1);
      const reflectedZ = 2 * diffuse * normalZ - light.z;
      const isSpecular = diffuse > 0 && Math.pow(Math.max(0, reflectedZ), 24) > 0.55;
      context.fillStyle = isSpecular ? specularHex : toneHexesDarkToLight[toneIndex];
      context.fillRect(pixelX, pixelY, 1, 1);
    }
  }
}
