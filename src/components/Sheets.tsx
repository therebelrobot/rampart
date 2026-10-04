import { type ReactNode, useEffect, useRef, useState } from "react";
import type { GeneratedPalette } from "../color/generate";
import { canShareFiles } from "../export/deliver";
import { procreateSwatchLimit } from "../export/formats";
import type { SavedPalette } from "../storage/library";
import { Icon } from "./ui";

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header className="sheet-header">
          <h2>{title}</h2>
          <button ref={closeButtonRef} type="button" className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export type ExportFormat = "procreate" | "procreate-share" | "ase" | "gpl" | "hex" | "png-cross" | "png-strip" | "copy";

interface ExportSheetProps {
  paletteName: string;
  palette: GeneratedPalette;
  orderedHexColors: string[];
  onExport: (format: ExportFormat) => void;
  onClose: () => void;
}

export function ExportSheet({ paletteName, orderedHexColors, onExport, onClose }: ExportSheetProps) {
  const shareAvailable = canShareFiles();
  const overLimit = orderedHexColors.length > procreateSwatchLimit;
  return (
    <Sheet title={`Export "${paletteName}"`} onClose={onClose}>
      <div className="export-preview">
        {orderedHexColors.map((hex, position) => (
          <span key={position} style={{ background: hex }} className={position >= procreateSwatchLimit ? "is-over" : ""} title={hex} />
        ))}
      </div>
      <p className="field-hint">
        {orderedHexColors.length} colors, in order: shared shadow, each ramp dark → light, then shared highlight.
        {overLimit && ` Procreate palettes hold ${procreateSwatchLimit}, so the faded swatches won't make it into the .swatches file.`}
      </p>

      <h3 className="sheet-subhead">Procreate</h3>
      <div className="export-grid">
        {shareAvailable && (
          <button type="button" className="button primary" onClick={() => onExport("procreate-share")}>
            <Icon name="share" /> Share to Procreate…
          </button>
        )}
        <button type="button" className={`button${shareAvailable ? "" : " primary"}`} onClick={() => onExport("procreate")}>
          <Icon name="download" /> .swatches
        </button>
        <button type="button" className="button" onClick={() => onExport("ase")}>
          <Icon name="download" /> .ase (fallback)
        </button>
      </div>
      <p className="field-hint">
        {shareAvailable
          ? "On iPad, pick Procreate in the share sheet and the palette shows up in the Palettes panel."
          : "On iPad, the file saves to Files. Tap it there to open it in Procreate. The share-sheet shortcut only appears when rampart is served over HTTPS."}
      </p>

      <h3 className="sheet-subhead">Pixel art tools</h3>
      <div className="export-grid">
        <button type="button" className="button" onClick={() => onExport("gpl")}><Icon name="download" /> .gpl (Aseprite, GIMP, Krita)</button>
        <button type="button" className="button" onClick={() => onExport("hex")}><Icon name="download" /> .hex (Lospec)</button>
        <button type="button" className="button" onClick={() => onExport("png-strip")}><Icon name="download" /> PNG, 1px per color</button>
        <button type="button" className="button" onClick={() => onExport("png-cross")}><Icon name="download" /> PNG swatch cross</button>
        <button type="button" className="button" onClick={() => onExport("copy")}><Icon name="copy" /> Copy hex list</button>
      </div>
    </Sheet>
  );
}

interface LibrarySheetProps {
  library: SavedPalette[];
  loadedPaletteId: string | null;
  onLoad: (palette: SavedPalette) => void;
  onRename: (palette: SavedPalette, name: string) => void;
  onDelete: (palette: SavedPalette) => void;
  onExportProcreate: (palette: SavedPalette) => void;
  onExportJson: (palettes: SavedPalette[], fileStem: string) => void;
  onImportJson: (jsonFile: File) => void;
  onClose: () => void;
}

export function LibrarySheet({ library, loadedPaletteId, onLoad, onRename, onDelete, onExportProcreate, onExportJson, onImportJson, onClose }: LibrarySheetProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const sortedLibrary = [...library].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));

  return (
    <Sheet title="Saved palettes" onClose={onClose}>
      <div className="library-actions">
        <button type="button" className="button" onClick={() => onExportJson(library, "rampart-library")} disabled={library.length === 0}>
          <Icon name="download" /> Export all (JSON)
        </button>
        <button type="button" className="button" onClick={() => importInputRef.current?.click()}>
          <Icon name="plus" /> Import JSON
        </button>
        <input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => {
          const jsonFile = event.target.files?.[0];
          event.target.value = "";
          if (jsonFile) onImportJson(jsonFile);
        }} />
      </div>
      <p className="field-hint">Palettes are stored in this browser. Use JSON export/import to back them up or move them between desktop and iPad.</p>

      {sortedLibrary.length === 0 && <p className="empty-state">Nothing saved yet. Name a palette in the top bar and hit Save.</p>}

      <ul className="library-list">
        {sortedLibrary.map((saved) => (
          <li key={saved.id} className={`library-item${saved.id === loadedPaletteId ? " is-loaded" : ""}`}>
            <button type="button" className="library-swatches" onClick={() => onLoad(saved)} aria-label={`Open ${saved.name}`}>
              {saved.hexColors.map((hex, position) => <span key={position} style={{ background: hex }} />)}
            </button>
            <div className="library-meta">
              {renamingId === saved.id ? (
                <form onSubmit={(event) => { event.preventDefault(); onRename(saved, renameDraft); setRenamingId(null); }}>
                  <input className="text-input" value={renameDraft} autoFocus maxLength={80} onChange={(event) => setRenameDraft(event.target.value)} onBlur={() => { onRename(saved, renameDraft); setRenamingId(null); }} />
                </form>
              ) : (
                <strong>{saved.name}</strong>
              )}
              <span className="library-date">{new Date(saved.updatedAt).toLocaleString()} · {saved.hexColors.length} colors · seed “{saved.recipe.seed}”</span>
            </div>
            <div className="library-buttons">
              <button type="button" className="button small" onClick={() => onLoad(saved)}>Open</button>
              <button type="button" className="button small" onClick={() => onExportProcreate(saved)} title="Download .swatches">.swatches</button>
              <button type="button" className="button small" onClick={() => onExportJson([saved], saved.name)} title="Download JSON">JSON</button>
              <button type="button" className="button small" onClick={() => { setRenamingId(saved.id); setRenameDraft(saved.name); }}>Rename</button>
              {confirmDeleteId === saved.id ? (
                <button type="button" className="button small danger" onClick={() => { onDelete(saved); setConfirmDeleteId(null); }}>Really delete</button>
              ) : (
                <button type="button" className="button small" onClick={() => setConfirmDeleteId(saved.id)} aria-label={`Delete ${saved.name}`}><Icon name="trash" /></button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
