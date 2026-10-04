import { useEffect, useState } from "react";
import { isValidHex, normalizeHex } from "../color/convert";
import type { GeneratedPalette, GeneratedRamp } from "../color/generate";
import type { HexMapper } from "../render/draw";
import { Icon } from "./ui";

interface RampListProps {
  palette: GeneratedPalette;
  displayHex: HexMapper;
  canRemove: boolean;
  onToggleLock: (ramp: GeneratedRamp) => void;
  onSetBase: (ramp: GeneratedRamp, hex: string) => void;
  onRename: (ramp: GeneratedRamp, label: string) => void;
  onRemove: (ramp: GeneratedRamp) => void;
  onSelectColor: (colorIndex: number) => void;
}

export function RampList({ palette, displayHex, canRemove, onToggleLock, onSetBase, onRename, onRemove, onSelectColor }: RampListProps) {
  return (
    <div className="ramp-list">
      {palette.ramps.map((ramp) => (
        <RampCard
          key={`${ramp.isNeutral ? "neutral" : ramp.rampIndex}`}
          ramp={ramp}
          palette={palette}
          displayHex={displayHex}
          canRemove={canRemove && !ramp.isNeutral}
          onToggleLock={onToggleLock}
          onSetBase={onSetBase}
          onRename={onRename}
          onRemove={onRemove}
          onSelectColor={onSelectColor}
        />
      ))}
    </div>
  );
}

function RampCard({ ramp, palette, displayHex, canRemove, onToggleLock, onSetBase, onRename, onRemove, onSelectColor }: Omit<RampListProps, "canRemove"> & { ramp: GeneratedRamp; canRemove: boolean }) {
  const [hexDraft, setHexDraft] = useState(ramp.baseHex);
  const [labelDraft, setLabelDraft] = useState(ramp.label);
  useEffect(() => setHexDraft(ramp.baseHex), [ramp.baseHex]);
  useEffect(() => setLabelDraft(ramp.label), [ramp.label]);

  const commitHex = () => {
    if (isValidHex(hexDraft) && normalizeHex(hexDraft) !== ramp.baseHex) onSetBase(ramp, normalizeHex(hexDraft));
    else setHexDraft(ramp.baseHex);
  };

  return (
    <article className={`ramp-card${ramp.locked ? " is-locked" : ""}`}>
      <header className="ramp-card-header">
        <input
          className="ramp-label-input"
          value={labelDraft}
          aria-label="Ramp name"
          maxLength={40}
          onChange={(event) => setLabelDraft(event.target.value)}
          onBlur={() => labelDraft.trim() !== ramp.label && onRename(ramp, labelDraft.trim())}
          onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
        />
        <button
          type="button"
          className={`icon-button${ramp.locked ? " is-active" : ""}`}
          aria-pressed={ramp.locked}
          title={ramp.locked ? "Locked: survives remix" : "Lock this ramp's midtone"}
          aria-label={ramp.locked ? "Unlock ramp" : "Lock ramp"}
          onClick={() => onToggleLock(ramp)}
        >
          <Icon name={ramp.locked ? "lock" : "unlock"} />
        </button>
        {canRemove && (
          <button type="button" className="icon-button" title="Remove ramp" aria-label="Remove ramp" onClick={() => onRemove(ramp)}>
            <Icon name="trash" />
          </button>
        )}
      </header>
      <div className="ramp-strip" role="list">
        {ramp.toneColorIndices.map((colorIndex, position) => {
          const color = palette.colors[colorIndex];
          return (
            <button
              key={position}
              type="button"
              role="listitem"
              className={`ramp-tone${position === ramp.midtonePosition ? " is-midtone" : ""}`}
              style={{ background: displayHex(color.hex) }}
              title={`${color.hex} · value ${Math.round(color.value * 100)}${color.usedByRampIndices.length > 1 ? " · shared" : ""}`}
              aria-label={color.hex}
              onClick={() => onSelectColor(colorIndex)}
            />
          );
        })}
      </div>
      <div className="ramp-base-row">
        <label className="color-well" title="Pick midtone">
          <input type="color" value={ramp.baseHex} onChange={(event) => onSetBase(ramp, event.target.value)} aria-label="Midtone color" />
          <span style={{ background: ramp.baseHex }} />
        </label>
        <input
          className="hex-input"
          value={hexDraft}
          spellCheck={false}
          autoCapitalize="off"
          aria-label="Midtone hex"
          onChange={(event) => setHexDraft(event.target.value)}
          onBlur={commitHex}
          onKeyDown={(event) => event.key === "Enter" && commitHex()}
        />
        <span className="ramp-meta">{ramp.isNeutral ? "neutral" : "midtone"}</span>
      </div>
    </article>
  );
}
