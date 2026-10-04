/**
 * Palette file formats. Pure functions (no DOM) so they can be unit tested.
 *
 *  - .swatches  Procreate: a zip containing Swatches.json with HSB 0..1 values
 *  - .ase       Adobe Swatch Exchange: also imported by Procreate, a fallback
 *  - .gpl       GIMP palette: Aseprite, Krita, GIMP, Lospec
 *  - .hex       one hex per line: Lospec / Aseprite / Pixelorama
 */

import { hexToHsb, hexToRgb } from "../color/convert";
import { concatenateBytes, createZip } from "./zip";

export const procreateSwatchLimit = 30;

export function buildProcreateSwatchesJson(paletteName: string, hexColors: string[]): string {
  const swatches = hexColors.slice(0, procreateSwatchLimit).map((hex) => {
    const hsb = hexToHsb(hex);
    return {
      hue: roundTo(hsb.hue / 360, 6),
      saturation: roundTo(hsb.saturation, 6),
      brightness: roundTo(hsb.brightness, 6),
      alpha: 1,
      colorSpace: 0,
    };
  });
  return JSON.stringify([{ name: paletteName, swatches }]);
}

export function buildProcreateSwatchesFile(paletteName: string, hexColors: string[]): Uint8Array {
  return createZip([
    { fileName: "Swatches.json", contents: new TextEncoder().encode(buildProcreateSwatchesJson(paletteName, hexColors)) },
  ]);
}

export function buildAdobeSwatchExchangeFile(paletteName: string, hexColors: string[]): Uint8Array {
  const encodeUtf16Name = (name: string) => {
    const characters = [...name, "\u0000"].join("");
    const view = new DataView(new ArrayBuffer(2 + characters.length * 2));
    view.setUint16(0, characters.length);
    for (let characterIndex = 0; characterIndex < characters.length; characterIndex++) {
      view.setUint16(2 + characterIndex * 2, characters.charCodeAt(characterIndex));
    }
    return new Uint8Array(view.buffer);
  };

  const blocks: Uint8Array[] = [];
  const pushBlock = (blockType: number, body: Uint8Array) => {
    const header = new DataView(new ArrayBuffer(6));
    header.setUint16(0, blockType);
    header.setUint32(2, body.length);
    blocks.push(new Uint8Array(header.buffer), body);
  };

  pushBlock(0xc001, encodeUtf16Name(paletteName));
  for (const hex of hexColors) {
    const rgb = hexToRgb(hex);
    const nameBytes = encodeUtf16Name(hex.toUpperCase());
    const colorBody = new DataView(new ArrayBuffer(4 + 12 + 2));
    colorBody.setUint8(0, "R".charCodeAt(0));
    colorBody.setUint8(1, "G".charCodeAt(0));
    colorBody.setUint8(2, "B".charCodeAt(0));
    colorBody.setUint8(3, " ".charCodeAt(0));
    colorBody.setFloat32(4, rgb.red);
    colorBody.setFloat32(8, rgb.green);
    colorBody.setFloat32(12, rgb.blue);
    colorBody.setUint16(16, 2); // normal (not global/spot)
    pushBlock(0x0001, concatenateBytes([nameBytes, new Uint8Array(colorBody.buffer)]));
  }
  pushBlock(0xc002, new Uint8Array(0));

  const fileHeader = new DataView(new ArrayBuffer(12));
  "ASEF".split("").forEach((character, characterIndex) => fileHeader.setUint8(characterIndex, character.charCodeAt(0)));
  fileHeader.setUint16(4, 1);
  fileHeader.setUint16(6, 0);
  fileHeader.setUint32(8, hexColors.length + 2);
  return concatenateBytes([new Uint8Array(fileHeader.buffer), ...blocks]);
}

export function buildGimpPalette(paletteName: string, hexColors: string[], columnCount: number): string {
  const lines = ["GIMP Palette", `Name: ${paletteName.replace(/[\r\n]/g, " ")}`, `Columns: ${columnCount}`, "#"];
  for (const hex of hexColors) {
    const rgb = hexToRgb(hex);
    const channels = [rgb.red, rgb.green, rgb.blue].map((channel) => String(Math.round(channel * 255)).padStart(3, " "));
    lines.push(`${channels.join(" ")}\t${hex.slice(1)}`);
  }
  return lines.join("\n") + "\n";
}

export function buildHexList(hexColors: string[]): string {
  return hexColors.map((hex) => hex.slice(1).toLowerCase()).join("\n") + "\n";
}

export function safeFileName(paletteName: string): string {
  return paletteName.trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").toLowerCase() || "palette";
}

const roundTo = (value: number, decimalPlaces: number) => Math.round(value * 10 ** decimalPlaces) / 10 ** decimalPlaces;
