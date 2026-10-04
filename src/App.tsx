import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type GeneratedRamp,
  generatePalette,
  orderedUniqueColorIndices,
  overrideKeyForRamp,
  withoutHueShifting,
} from "./color/generate";
import { hexPerceivedValue, hexToHsb, hsbToHex, solveHsbForValue } from "./color/convert";
import { extractMidtonesFromImage } from "./color/extract";
import { generateSeedPhrase } from "./color/random";
import { type PaletteRecipe, type PaletteSettings, type RampOverride, defaultSettings } from "./color/settings";
import { canvasToPngBytes, downloadBytes, shareBytes } from "./export/deliver";
import {
  buildAdobeSwatchExchangeFile,
  buildGimpPalette,
  buildHexList,
  buildProcreateSwatchesFile,
  safeFileName,
} from "./export/formats";
import { drawPaletteStrip, drawSwatchCross, identityHex, toValueGray } from "./render/draw";
import {
  type SavedPalette,
  buildLibraryExport,
  createPaletteId,
  decodeRecipeFromUrl,
  encodeRecipeForUrl,
  mergeImportedJson,
  readLibrary,
  sanitizeRecipe,
  writeLibrary,
} from "./storage/library";
import { Controls } from "./components/Controls";
import { ColorInspector, Preview, type PreviewBackground, ValueScale } from "./components/Preview";
import { RampList } from "./components/RampList";
import { type ExportFormat, ExportSheet, LibrarySheet } from "./components/Sheets";
import { SwatchCross } from "./components/SwatchCross";
import { Icon } from "./components/ui";

const sessionStorageKey = "rampart.session.v1";

interface SessionState {
  recipe: PaletteRecipe;
  paletteName: string;
  loadedPaletteId: string | null;
}

function loadInitialSession(): SessionState {
  const hashMatch = window.location.hash.match(/r=([\w-]+)/);
  const recipeFromUrl = hashMatch ? decodeRecipeFromUrl(hashMatch[1]) : null;
  let storedSession: Partial<SessionState> = {};
  try {
    storedSession = JSON.parse(localStorage.getItem(sessionStorageKey) ?? "{}");
  } catch {
    storedSession = {};
  }
  const storedRecipe = sanitizeRecipe(storedSession.recipe);
  const recipe = recipeFromUrl ?? storedRecipe ?? { seed: generateSeedPhrase(), settings: { ...defaultSettings }, overrides: {} };
  // a shared/bookmarked link for a different palette shouldn't inherit this session's name
  const sessionMatchesRecipe = !recipeFromUrl || (storedRecipe !== null && JSON.stringify(storedRecipe) === JSON.stringify(recipeFromUrl));
  return {
    recipe,
    paletteName: sessionMatchesRecipe && typeof storedSession.paletteName === "string" ? storedSession.paletteName : "Untitled palette",
    loadedPaletteId: sessionMatchesRecipe && typeof storedSession.loadedPaletteId === "string" ? storedSession.loadedPaletteId : null,
  };
}

/** Undo/redo over recipes. Rapid changes with the same key (slider drags) merge into one step. */
function useRecipeHistory(initialRecipe: PaletteRecipe) {
  const [history, setHistory] = useState({ past: [] as PaletteRecipe[], present: initialRecipe, future: [] as PaletteRecipe[] });
  const lastCommit = useRef<{ key: string | null; time: number }>({ key: null, time: 0 });

  const commit = useCallback((nextRecipe: PaletteRecipe | ((current: PaletteRecipe) => PaletteRecipe), coalesceKey?: string) => {
    setHistory((current) => {
      const resolved = typeof nextRecipe === "function" ? nextRecipe(current.present) : nextRecipe;
      const now = Date.now();
      const shouldMerge = coalesceKey !== undefined && lastCommit.current.key === coalesceKey && now - lastCommit.current.time < 900;
      lastCommit.current = { key: coalesceKey ?? null, time: now };
      return {
        past: shouldMerge ? current.past : [...current.past.slice(-99), current.present],
        present: resolved,
        future: [],
      };
    });
  }, []);
  const undo = useCallback(() => setHistory((current) => current.past.length === 0 ? current : {
    past: current.past.slice(0, -1), present: current.past[current.past.length - 1], future: [current.present, ...current.future],
  }), []);
  const redo = useCallback(() => setHistory((current) => current.future.length === 0 ? current : {
    past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1),
  }), []);
  const reset = useCallback((recipe: PaletteRecipe) => setHistory((current) => ({ past: [...current.past, current.present], present: recipe, future: [] })), []);

  return { recipe: history.present, commit, undo, redo, reset, canUndo: history.past.length > 0, canRedo: history.future.length > 0 };
}

export function App() {
  const initialSession = useMemo(loadInitialSession, []);
  const { recipe, commit, undo, redo, reset, canUndo, canRedo } = useRecipeHistory(initialSession.recipe);
  const [paletteName, setPaletteName] = useState(initialSession.paletteName);
  const [loadedPaletteId, setLoadedPaletteId] = useState<string | null>(initialSession.loadedPaletteId);
  const [library, setLibrary] = useState<SavedPalette[]>(() => readLibrary());
  const [seedDraft, setSeedDraft] = useState(recipe.seed);
  const [valueCheckMode, setValueCheckMode] = useState(false);
  const [showUnshifted, setShowUnshifted] = useState(false);
  const [previewBackground, setPreviewBackground] = useState<PreviewBackground>("dusk");
  const [selectedColorIndex, setSelectedColorIndex] = useState<number | null>(null);
  const [openSheet, setOpenSheet] = useState<"export" | "library" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const topbarRef = useRef<HTMLElement>(null);

  // the sticky palette stage (stacked iPad layout) sits right under the top bar, whose height varies as it wraps
  useEffect(() => {
    const topbar = topbarRef.current;
    if (!topbar || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      document.documentElement.style.setProperty("--topbar-height", `${topbar.offsetHeight}px`));
    observer.observe(topbar);
    return () => observer.disconnect();
  }, []);

  const palette = useMemo(() => generatePalette(recipe), [recipe]);
  const unshiftedPalette = useMemo(() => (showUnshifted ? generatePalette(withoutHueShifting(recipe)) : null), [recipe, showUnshifted]);
  const orderedHexColors = useMemo(() => orderedUniqueColorIndices(palette).map((colorIndex) => palette.colors[colorIndex].hex), [palette]);
  const displayHex = valueCheckMode ? toValueGray : identityHex;
  const loadedPalette = library.find((saved) => saved.id === loadedPaletteId) ?? null;
  const hasUnsavedChanges = !loadedPalette || JSON.stringify(loadedPalette.recipe) !== JSON.stringify(recipe) || loadedPalette.name !== paletteName;

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  // keep the seed field, URL and session in sync with the current recipe
  useEffect(() => setSeedDraft(recipe.seed), [recipe.seed]);
  useEffect(() => {
    window.history.replaceState(null, "", `#r=${encodeRecipeForUrl(recipe)}`);
    try {
      localStorage.setItem(sessionStorageKey, JSON.stringify({ recipe, paletteName, loadedPaletteId }));
    } catch {
      /* storage unavailable; URL still carries the recipe */
    }
  }, [recipe, paletteName, loadedPaletteId]);
  useEffect(() => {
    if (selectedColorIndex !== null && selectedColorIndex >= palette.colors.length) setSelectedColorIndex(null);
  }, [palette, selectedColorIndex]);

  const updateSettings = useCallback((patch: Partial<PaletteSettings>, coalesceKey?: string) => {
    commit((current) => ({ ...current, settings: { ...current.settings, ...patch } }), coalesceKey);
  }, [commit]);

  const updateOverride = useCallback((overrideKey: number, patch: Partial<RampOverride>, coalesceKey?: string) => {
    commit((current) => ({
      ...current,
      overrides: { ...current.overrides, [overrideKey]: { ...current.overrides[overrideKey], ...patch } },
    }), coalesceKey);
  }, [commit]);

  /** New seed; locked ramps keep their midtone, everything keeps its name. */
  const remix = useCallback(() => {
    commit((current) => {
      const keptOverrides: PaletteRecipe["overrides"] = {};
      for (const [overrideKey, override] of Object.entries(current.overrides)) {
        if (override.locked) keptOverrides[Number(overrideKey)] = override;
        else if (override.label) keptOverrides[Number(overrideKey)] = { label: override.label };
      }
      return { ...current, seed: generateSeedPhrase(), overrides: keptOverrides };
    });
  }, [commit]);

  const applySeed = () => {
    const trimmedSeed = seedDraft.trim();
    if (trimmedSeed && trimmedSeed !== recipe.seed) {
      commit((current) => {
        const keptOverrides: PaletteRecipe["overrides"] = {};
        for (const [overrideKey, override] of Object.entries(current.overrides)) {
          if (override.locked) keptOverrides[Number(overrideKey)] = override;
          else if (override.label) keptOverrides[Number(overrideKey)] = { label: override.label };
        }
        return { ...current, seed: trimmedSeed, overrides: keptOverrides };
      });
    } else {
      setSeedDraft(recipe.seed);
    }
  };

  const toggleLock = (ramp: GeneratedRamp) => {
    const overrideKey = overrideKeyForRamp(ramp);
    // locking pins the current midtone so it survives remixes; unlocking leaves it in place until the next remix
    updateOverride(overrideKey, ramp.locked ? { locked: false } : { locked: true, baseHex: ramp.baseHex });
  };
  const setRampBase = (ramp: GeneratedRamp, hex: string) =>
    updateOverride(overrideKeyForRamp(ramp), { baseHex: hex, locked: true }, `base-${overrideKeyForRamp(ramp)}`);
  const renameRamp = (ramp: GeneratedRamp, label: string) => updateOverride(overrideKeyForRamp(ramp), { label: label || undefined });
  const removeRamp = (ramp: GeneratedRamp) => {
    commit((current) => {
      // pin every remaining midtone so removing one ramp doesn't reshuffle the others
      const nextOverrides: PaletteRecipe["overrides"] = {};
      let nextRampIndex = 0;
      for (const generatedRamp of palette.ramps) {
        const overrideKey = overrideKeyForRamp(generatedRamp);
        const existing = current.overrides[overrideKey] ?? {};
        if (generatedRamp.isNeutral) {
          nextOverrides[overrideKey] = existing;
          continue;
        }
        if (generatedRamp.rampIndex === ramp.rampIndex) continue;
        nextOverrides[nextRampIndex] = { ...existing, baseHex: generatedRamp.baseHex };
        nextRampIndex++;
      }
      return { ...current, settings: { ...current.settings, rampCount: Math.max(1, current.settings.rampCount - 1) }, overrides: nextOverrides };
    });
  };

  const seedFromImage = async (imageFile: File) => {
    try {
      // keep each extracted hue/saturation, but pull its value into the midtone range so the ramp has room both ways
      const { baseValueMinimum, baseValueMaximum } = recipe.settings;
      const midtoneHexes = (await extractMidtonesFromImage(imageFile, recipe.settings.rampCount)).map((hex) => {
        const value = hexPerceivedValue(hex);
        const clampedValue = Math.min(baseValueMaximum + 0.05, Math.max(baseValueMinimum - 0.05, value));
        if (clampedValue === value) return hex;
        const hsb = hexToHsb(hex);
        return hsbToHex(solveHsbForValue(hsb.hue, hsb.saturation, clampedValue));
      });
      commit((current) => {
        const nextOverrides = { ...current.overrides };
        midtoneHexes.forEach((hex, rampIndex) => {
          nextOverrides[rampIndex] = { ...nextOverrides[rampIndex], baseHex: hex, locked: false };
        });
        return { ...current, seed: `image-${imageFile.name.replace(/\.[^.]+$/, "")}`, overrides: nextOverrides };
      });
      showToast(`Pulled ${midtoneHexes.length} midtones from ${imageFile.name}`);
    } catch (extractionError) {
      showToast(extractionError instanceof Error ? extractionError.message : "Couldn't read that image");
    }
  };

  const savePalette = (asCopy = false) => {
    const now = new Date().toISOString();
    const trimmedName = paletteName.trim() || "Untitled palette";
    let nextLibrary: SavedPalette[];
    let savedId: string;
    if (loadedPalette && !asCopy) {
      savedId = loadedPalette.id;
      nextLibrary = library.map((saved) => saved.id === savedId ? { ...saved, name: trimmedName, updatedAt: now, recipe, hexColors: orderedHexColors } : saved);
    } else {
      savedId = createPaletteId();
      nextLibrary = [...library, { id: savedId, name: asCopy ? `${trimmedName} copy` : trimmedName, createdAt: now, updatedAt: now, recipe, hexColors: orderedHexColors }];
      if (asCopy) setPaletteName(`${trimmedName} copy`);
    }
    setLibrary(nextLibrary);
    setLoadedPaletteId(savedId);
    showToast(writeLibrary(nextLibrary) ? `Saved "${asCopy ? `${trimmedName} copy` : trimmedName}"` : "Saved for this session only: browser storage is unavailable");
  };

  const loadSavedPalette = (saved: SavedPalette) => {
    reset(saved.recipe);
    setPaletteName(saved.name);
    setLoadedPaletteId(saved.id);
    setOpenSheet(null);
    showToast(`Opened "${saved.name}"`);
  };

  const persistLibrary = (nextLibrary: SavedPalette[]) => {
    setLibrary(nextLibrary);
    writeLibrary(nextLibrary);
  };

  const copyText = async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMessage);
    } catch {
      showToast("Clipboard unavailable here");
    }
  };

  const exportPalette = async (format: ExportFormat) => {
    const name = paletteName.trim() || "Untitled palette";
    const fileStem = safeFileName(name);
    switch (format) {
      case "procreate":
        downloadBytes(buildProcreateSwatchesFile(name, orderedHexColors), `${fileStem}.swatches`, "application/zip");
        break;
      case "procreate-share": {
        const shared = await shareBytes(buildProcreateSwatchesFile(name, orderedHexColors), `${fileStem}.swatches`, name);
        if (!shared) downloadBytes(buildProcreateSwatchesFile(name, orderedHexColors), `${fileStem}.swatches`, "application/zip");
        break;
      }
      case "ase":
        downloadBytes(buildAdobeSwatchExchangeFile(name, orderedHexColors), `${fileStem}.ase`, "application/octet-stream");
        break;
      case "gpl":
        downloadBytes(buildGimpPalette(name, orderedHexColors, Math.min(orderedHexColors.length, 16)), `${fileStem}.gpl`, "text/plain");
        break;
      case "hex":
        downloadBytes(buildHexList(orderedHexColors), `${fileStem}.hex`, "text/plain");
        break;
      case "png-strip":
        downloadBytes(await canvasToPngBytes(drawPaletteStrip(orderedHexColors, 1)), `${fileStem}-1px.png`, "image/png");
        break;
      case "png-cross":
        downloadBytes(await canvasToPngBytes(drawSwatchCross(palette, 32)), `${fileStem}-swatches.png`, "image/png");
        break;
      case "copy":
        await copyText(orderedHexColors.join("\n"), `Copied ${orderedHexColors.length} hex codes`);
        break;
    }
  };

  // keyboard: space remixes (like coolors), ⌘/Ctrl+Z undo, ⇧⌘Z / Ctrl+Y redo
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isTyping = target.closest("input, textarea, select, [contenteditable]") !== null;
      if (event.code === "Space" && !isTyping && !openSheet && target.tagName !== "BUTTON" && target.tagName !== "SUMMARY") {
        event.preventDefault();
        remix();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !isTyping) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (event.ctrlKey && event.key.toLowerCase() === "y" && !isTyping) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [remix, undo, redo, openSheet]);

  const blendWarnings = palette.warnings;

  return (
    <div className={`app${valueCheckMode ? " is-value-check" : ""}`}>
      <header className="topbar" ref={topbarRef}>
        <div className="brand">
          <svg viewBox="0 0 7 7" width="28" height="28" shapeRendering="crispEdges" aria-hidden="true">
            {orderedHexColors.length > 0 && [
              [3, 0], [3, 1], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [3, 4], [3, 5], [3, 6], [2, 2], [4, 4], [2, 4], [4, 2],
            ].map(([column, row], cellPosition) => (
              <rect key={cellPosition} x={column} y={row} width="1" height="1"
                fill={displayHex(orderedHexColors[Math.round((cellPosition / 15) * (orderedHexColors.length - 1))])} />
            ))}
          </svg>
          <span className="brand-name">rampart</span>
        </div>

        <form className="seed-form" onSubmit={(event) => { event.preventDefault(); applySeed(); }}>
          <label className="seed-label" htmlFor="seed-input">seed</label>
          <input id="seed-input" className="seed-input" value={seedDraft} spellCheck={false} autoCapitalize="off" autoComplete="off"
            onChange={(event) => setSeedDraft(event.target.value)} onBlur={applySeed} />
        </form>
        <button type="button" className="button primary remix" onClick={remix} title="New seed (Space). Locked ramps stay.">
          <Icon name="dice" /> Remix
        </button>
        <div className="history-buttons">
          <button type="button" className="icon-button" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)"><Icon name="undo" /></button>
          <button type="button" className="icon-button" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (⇧⌘Z)"><Icon name="redo" /></button>
        </div>

        <div className="topbar-spacer" />

        <label className="check value-toggle" title="Turn everything grayscale to check values, as the book suggests">
          <input type="checkbox" checked={valueCheckMode} onChange={(event) => setValueCheckMode(event.target.checked)} />
          Value check
        </label>
        <form className="save-form" onSubmit={(event) => { event.preventDefault(); savePalette(); }}>
          <input className="text-input name-input" value={paletteName} maxLength={80} aria-label="Palette name" onChange={(event) => setPaletteName(event.target.value)} />
          <button type="submit" className="button" title={loadedPalette ? "Update the saved palette" : "Save to library"}>
            {loadedPalette ? (hasUnsavedChanges ? "Save •" : "Saved") : "Save"}
          </button>
          {loadedPalette && (
            <button type="button" className="button" onClick={() => savePalette(true)} title="Save as a new palette">Copy</button>
          )}
        </form>
        <button type="button" className="button" onClick={() => setOpenSheet("library")}>
          <Icon name="library" /> Library{library.length > 0 ? ` (${library.length})` : ""}
        </button>
        <button type="button" className="button accent" onClick={() => setOpenSheet("export")}>
          <Icon name="download" /> Export
        </button>
      </header>

      <main className="layout">
        <section className="workspace">
          <div className="panel stage">
            <SwatchCross palette={palette} displayHex={displayHex} selectedColorIndex={selectedColorIndex} onSelectColor={setSelectedColorIndex} />
            <ColorInspector palette={palette} colorIndex={selectedColorIndex} onCopy={(hex) => copyText(hex, `Copied ${hex}`)} />
          </div>

          {blendWarnings.length > 0 && (
            <ul className="warnings">
              {blendWarnings.map((warning, warningPosition) => <li key={warningPosition} className={`warning is-${warning.kind}`}>{warning.message}</li>)}
            </ul>
          )}

          <section className="panel">
            <div className="panel-header">
              <h2>Ramps</h2>
              <span className="panel-note">Lock a ramp to keep its midtone through remixes. Editing a midtone locks it.</span>
              {recipe.settings.rampCount < 8 && (
                <button type="button" className="button small" onClick={() => updateSettings({ rampCount: recipe.settings.rampCount + 1 })}>
                  <Icon name="plus" /> Add ramp
                </button>
              )}
            </div>
            <RampList palette={palette} displayHex={displayHex} canRemove={recipe.settings.rampCount > 1}
              onToggleLock={toggleLock} onSetBase={setRampBase} onRename={renameRamp} onRemove={removeRamp} onSelectColor={setSelectedColorIndex} />
          </section>

          <Preview palette={palette} unshiftedPalette={unshiftedPalette} displayHex={displayHex}
            background={previewBackground} onBackgroundChange={setPreviewBackground}
            showUnshifted={showUnshifted} onShowUnshiftedChange={setShowUnshifted} />

          <ValueScale palette={palette} onSelectColor={setSelectedColorIndex} />
        </section>

        <aside className="sidebar" aria-label="Palette controls">
          <Controls settings={recipe.settings} onChange={updateSettings} onSeedFromImage={seedFromImage} colorCount={palette.colors.length} />
        </aside>
      </main>

      {openSheet === "export" && (
        <ExportSheet paletteName={paletteName.trim() || "Untitled palette"} palette={palette} orderedHexColors={orderedHexColors} onExport={exportPalette} onClose={() => setOpenSheet(null)} />
      )}
      {openSheet === "library" && (
        <LibrarySheet
          library={library}
          loadedPaletteId={loadedPaletteId}
          onLoad={loadSavedPalette}
          onRename={(saved, name) => {
            const trimmedName = name.trim();
            if (!trimmedName || trimmedName === saved.name) return;
            persistLibrary(library.map((entry) => entry.id === saved.id ? { ...entry, name: trimmedName, updatedAt: new Date().toISOString() } : entry));
            if (saved.id === loadedPaletteId) setPaletteName(trimmedName);
          }}
          onDelete={(saved) => {
            persistLibrary(library.filter((entry) => entry.id !== saved.id));
            if (saved.id === loadedPaletteId) setLoadedPaletteId(null);
            showToast(`Deleted "${saved.name}"`);
          }}
          onExportProcreate={(saved) => downloadBytes(buildProcreateSwatchesFile(saved.name, saved.hexColors), `${safeFileName(saved.name)}.swatches`, "application/zip")}
          onExportJson={(palettes, fileStem) => downloadBytes(JSON.stringify(buildLibraryExport(palettes), null, 2), `${safeFileName(fileStem)}.json`, "application/json")}
          onImportJson={async (jsonFile) => {
            try {
              const result = mergeImportedJson(library, await jsonFile.text());
              persistLibrary(result.palettes);
              showToast(`Imported: ${result.addedCount} added, ${result.updatedCount} updated, ${result.skippedCount} skipped`);
            } catch {
              showToast("That file isn't valid rampart JSON");
            }
          }}
          onClose={() => setOpenSheet(null)}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
