import { useEffect, useRef } from "react";
import { hexToHsb } from "../color/convert";
import type { GeneratedPalette } from "../color/generate";
import { type HexMapper, drawShadedSphere, toValueGray } from "../render/draw";

export type PreviewBackground = "dusk" | "paper" | "shadow";

const backgroundHexes: Record<PreviewBackground, string> = {
  dusk: "#3a3346",
  paper: "#d9d4c7",
  shadow: "",
};

function rampToneHexes(palette: GeneratedPalette, rampPosition: number): string[] {
  return palette.ramps[rampPosition].toneColorIndices.map((colorIndex) => palette.colors[colorIndex].hex);
}

function SphereRow({ palette, displayHex, background }: { palette: GeneratedPalette; displayHex: HexMapper; background: PreviewBackground }) {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  useEffect(() => {
    const sharedShadowHex = palette.sharedShadowColorIndex !== null ? palette.colors[palette.sharedShadowColorIndex].hex : null;
    const sharedHighlightHex = palette.sharedHighlightColorIndex !== null ? palette.colors[palette.sharedHighlightColorIndex].hex : null;
    const backgroundHex = background === "shadow" ? sharedShadowHex ?? "#202028" : backgroundHexes[background];
    palette.ramps.forEach((_, rampPosition) => {
      const canvas = canvasRefs.current[rampPosition];
      if (!canvas) return;
      const tones = rampToneHexes(palette, rampPosition);
      const outlineHex = sharedShadowHex ?? tones[0];
      const specularHex = sharedHighlightHex ?? tones[tones.length - 1];
      // cast shadow: the background's own darker tone, nudged toward the outline
      const groundShadowHex = background === "shadow" ? tones[0] : outlineHex;
      drawShadedSphere(canvas, tones.map(displayHex), displayHex(outlineHex), displayHex(specularHex), displayHex(backgroundHex), displayHex(groundShadowHex));
    });
  }, [palette, displayHex, background]);

  return (
    <div className="sphere-row">
      {palette.ramps.map((ramp, rampPosition) => (
        <figure key={ramp.isNeutral ? "neutral" : ramp.rampIndex} className="sphere">
          <canvas ref={(canvas) => { canvasRefs.current[rampPosition] = canvas; }} aria-label={`${ramp.label} test sphere`} />
          <figcaption>{ramp.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

interface PreviewProps {
  palette: GeneratedPalette;
  unshiftedPalette: GeneratedPalette | null;
  displayHex: HexMapper;
  background: PreviewBackground;
  onBackgroundChange: (background: PreviewBackground) => void;
  showUnshifted: boolean;
  onShowUnshiftedChange: (show: boolean) => void;
}

export function Preview({ palette, unshiftedPalette, displayHex, background, onBackgroundChange, showUnshifted, onShowUnshiftedChange }: PreviewProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Test spheres</h2>
        <div className="panel-tools">
          <select className="select compact" value={background} onChange={(event) => onBackgroundChange(event.target.value as PreviewBackground)} aria-label="Preview background">
            <option value="dusk">Dusk background</option>
            <option value="paper">Paper background</option>
            <option value="shadow">Shared-shadow background</option>
          </select>
          <label className="check">
            <input type="checkbox" checked={showUnshifted} onChange={(event) => onShowUnshiftedChange(event.target.checked)} />
            Compare without hue shift
          </label>
        </div>
      </div>
      <SphereRow palette={palette} displayHex={displayHex} background={background} />
      {showUnshifted && unshiftedPalette && (
        <>
          <p className="compare-caption">Without hue shifting: same values, hue locked. Notice how murky the shades get.</p>
          <SphereRow palette={unshiftedPalette} displayHex={displayHex} background={background} />
        </>
      )}
    </section>
  );
}

/** Every color sorted by value with its grayscale twin beneath, like the book's value demo. */
export function ValueScale({ palette, onSelectColor }: { palette: GeneratedPalette; onSelectColor: (colorIndex: number) => void }) {
  const sortedIndices = palette.colors.map((_, colorIndex) => colorIndex).sort((first, second) => palette.colors[first].value - palette.colors[second].value);
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Value scale</h2>
        <span className="panel-note">Top: color. Bottom: perceived value. Neighbours that look alike in gray will blend.</span>
      </div>
      <div className="value-scale">
        {sortedIndices.map((colorIndex) => {
          const color = palette.colors[colorIndex];
          return (
            <button key={colorIndex} type="button" className="value-column" onClick={() => onSelectColor(colorIndex)} title={`${color.hex} · value ${Math.round(color.value * 100)}`}>
              <span style={{ background: color.hex }} />
              <span style={{ background: toValueGray(color.hex) }} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function ColorInspector({ palette, colorIndex, onCopy }: { palette: GeneratedPalette; colorIndex: number | null; onCopy: (text: string) => void }) {
  if (colorIndex === null || !palette.colors[colorIndex]) {
    return <div className="inspector is-empty">Tap a swatch to inspect it.</div>;
  }
  const color = palette.colors[colorIndex];
  const hsb = hexToHsb(color.hex);
  const roleLabels: Record<string, string> = {
    "shared-shadow": "shared darkest shadow",
    "shared-highlight": "shared highlight",
    shadow: "shadow tone",
    midtone: "midtone",
    light: "light tone",
    bridged: "bridged color",
  };
  const rampNames = color.usedByRampIndices
    .map((rampIndex) => palette.ramps.find((ramp) => ramp.rampIndex === rampIndex)?.label)
    .filter(Boolean);
  return (
    <div className="inspector">
      <span className="inspector-chip" style={{ background: color.hex }} />
      <button type="button" className="inspector-hex" onClick={() => onCopy(color.hex)} title="Copy hex">{color.hex}</button>
      <span className="inspector-stat"><b>value</b> {Math.round(color.value * 100)}</span>
      <span className="inspector-stat"><b>HSB</b> {Math.round(hsb.hue)}° {Math.round(hsb.saturation * 100)}% {Math.round(hsb.brightness * 100)}%</span>
      <span className="inspector-stat"><b>{roleLabels[color.role]}</b>{rampNames.length > 1 ? ` · binds ${rampNames.join(", ")}` : rampNames.length === 1 ? ` · ${rampNames[0]}` : ""}</span>
    </div>
  );
}
