import type { GeneratedPalette } from "../color/generate";
import type { HexMapper } from "../render/draw";
import { layoutSwatchCross } from "../render/layout";

interface SwatchCrossProps {
  palette: GeneratedPalette;
  displayHex: HexMapper;
  selectedColorIndex: number | null;
  onSelectColor: (colorIndex: number) => void;
}

/** The book-style palette diagram, rendered as tappable swatches. */
export function SwatchCross({ palette, displayHex, selectedColorIndex, onSelectColor }: SwatchCrossProps) {
  const layout = layoutSwatchCross(palette);
  const rampByIndex = new Map(palette.ramps.map((ramp) => [ramp.rampIndex, ramp]));

  return (
    <div className="cross-wrap">
      <div
        className="cross"
        style={{
          gridTemplateColumns: `repeat(${layout.columnCount}, var(--cell))`,
          gridTemplateRows: `repeat(${layout.rowCount}, var(--cell)) auto`,
        }}
      >
        <div className="cross-key-frame" style={{ gridRow: layout.keyRow + 1, gridColumn: "1 / -1" }} aria-hidden="true" />
        {layout.cells.map((cell) => {
          const color = palette.colors[cell.colorIndex];
          const isBinding = color.usedByRampIndices.length > 1 && cell.rampIndex !== null;
          const isSelected = selectedColorIndex === cell.colorIndex;
          return (
            <button
              key={`${cell.column}-${cell.row}`}
              type="button"
              className={`cross-cell${cell.isKeyRow ? " is-key" : ""}${isSelected ? " is-selected" : ""}`}
              style={{ gridColumn: cell.column + 1, gridRow: cell.row + 1, background: displayHex(color.hex) }}
              aria-label={`${color.hex}, value ${Math.round(color.value * 100)}`}
              title={`${color.hex} · value ${Math.round(color.value * 100)}`}
              onClick={() => onSelectColor(cell.colorIndex)}
            >
              {isBinding && <span className="binding-mark" aria-hidden="true" />}
            </button>
          );
        })}
        {layout.columnRampIndices.map((rampIndex, column) => {
          const label = rampIndex === null
            ? column === 0 ? "dark" : "light"
            : rampByIndex.get(rampIndex)?.label ?? "";
          return (
            <span key={`label-${column}`} className="cross-label" style={{ gridColumn: column + 1, gridRow: layout.rowCount + 1 }} title={label}>
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
