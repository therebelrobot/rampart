/**
 * The "swatch cross" from the book's palette diagrams: a framed key row with
 * the shared darkest shadow on the left, each ramp's midtone, and the shared
 * highlight on the right. Each ramp's lighter tones stack upward from its
 * midtone and its darker tones stack downward.
 */

import type { GeneratedPalette } from "../color/generate";

export interface CrossCell {
  column: number;
  row: number;
  colorIndex: number;
  rampIndex: number | null;
  isKeyRow: boolean;
}

export interface CrossLayout {
  columnCount: number;
  rowCount: number;
  keyRow: number;
  cells: CrossCell[];
  /** ramp index per column (null for shared columns) */
  columnRampIndices: (number | null)[];
}

export function layoutSwatchCross(palette: GeneratedPalette): CrossLayout {
  const maximumLightCount = Math.max(0, ...palette.ramps.map((ramp) => ramp.toneColorIndices.length - 1 - ramp.midtonePosition));
  const maximumShadowCount = Math.max(0, ...palette.ramps.map((ramp) => ramp.midtonePosition));
  const keyRow = maximumLightCount;
  const cells: CrossCell[] = [];
  const columnRampIndices: (number | null)[] = [];
  let column = 0;

  if (palette.sharedShadowColorIndex !== null) {
    cells.push({ column, row: keyRow, colorIndex: palette.sharedShadowColorIndex, rampIndex: null, isKeyRow: true });
    columnRampIndices.push(null);
    column++;
  }
  for (const ramp of palette.ramps) {
    ramp.toneColorIndices.forEach((colorIndex, position) => {
      const offsetFromMidtone = position - ramp.midtonePosition;
      cells.push({ column, row: keyRow - offsetFromMidtone, colorIndex, rampIndex: ramp.rampIndex, isKeyRow: offsetFromMidtone === 0 });
    });
    columnRampIndices.push(ramp.rampIndex);
    column++;
  }
  if (palette.sharedHighlightColorIndex !== null) {
    cells.push({ column, row: keyRow, colorIndex: palette.sharedHighlightColorIndex, rampIndex: null, isKeyRow: true });
    columnRampIndices.push(null);
    column++;
  }

  return { columnCount: column, rowCount: maximumLightCount + 1 + maximumShadowCount, keyRow, cells, columnRampIndices };
}
