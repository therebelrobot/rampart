# rampart

A self-hosted color palette generator for pixel art, built around value-first, hue-shifted color ramps. It's like coolors, but every palette follows the palette-building method from the *Pixels Forever* lessons on color palettes and color shifting. Export straight to Procreate, Aseprite, GIMP, Krita, or Lospec.

Everything runs in the browser. Palettes are saved to `localStorage`, with JSON import/export for backup and for moving palettes between desktop and iPad. The server only serves static files.

## How the book's rules map to the app

| Book concept | What rampart does |
|---|---|
| **Value ≠ brightness.** Yellow reads lighter than blue at the same HSB brightness | Every tone gets a *perceived-value* target (OKLab lightness). Brightness is solved per hue to hit that target, so the value steps are even across hues. |
| **Start from grayscale values (fewer than 8)** | Shadow and light tone counts (0–4 each) lay out a value scale around each midtone. The *Value scale* panel shows every color sorted by value next to its gray twin. |
| **Hue shifting: lights → yellow, sat ↓, value ↑. Shadows → blue, sat ↑, value ↓** | Each step rotates hue toward the *light* or *shadow* hue (shortest arc, never overshooting) and shifts saturation. Light-source presets change the targets: sunlight, golden hour, moonlight, firelight, canopy, neon. |
| **Without hue shifting, shades look murky and lifeless** | *Compare without hue shift* renders the same palette with hue locked, side by side. |
| **Shared / binding colors** (black for outlines, white for highlights) | A tinted near-black and a tinted near-white shared by every ramp. Swatches used by more than one ramp get a small white marker. |
| **Choose base colors** (monochrome, analogous, complementary…) | Harmony schemes for the midtones. Lock or edit a midtone and the unlocked ramps re-harmonize around it. |
| **Color bridging:** replace two near-identical colors with one in-between | Tones from different ramps within the bridging distance merge into their perceptual average. Tones within the same ramp never merge, and midtones can be protected. |
| **Low value contrast loses focus. Close values blend** | Neighbouring tones closer than your threshold are flagged. *Value check* turns the whole UI grayscale, the book's "turn it black and white" test. |
| **Cartoony vs realistic** | Style presets: *Cartoony* (saturated, 1 light + 1 shadow), *Balanced*, *Realistic* (desaturated, more tones). |
| **Swatch-cross diagram** | The main view: a framed key row (shared shadow · midtones · shared highlight) with lights stacked above and shadows below. It also exports as a PNG. |

## Using it

- **Seed:** type any string. The same seed and settings always give the same palette, and the whole recipe is kept in the URL, so you can bookmark or share it.
- **Remix** (or press <kbd>Space</kbd>): new seed. Locked ramps keep their midtone, and ramp names are kept.
- **Lock / edit:** lock a ramp from its card, or set its midtone with the picker or hex field. Editing a midtone locks it.
- **Undo / redo:** <kbd>⌘Z</kbd> / <kbd>⇧⌘Z</kbd> (<kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd>), or the arrow buttons.
- **Pull midtones from an image** (optional): k-means picks the base colors. The ramps around them still follow the rules above.
- **Save:** name the palette in the top bar and click Save. The **Library** lets you open, rename, delete, download `.swatches`, and export or import JSON. Saves keep both the recipe (so you can keep tweaking) and the resolved colors.

## Getting a palette into Procreate

Export → **.swatches**. The file is a zip containing `Swatches.json`, which Procreate imports as a palette. Swatches are ordered shared shadow, then each ramp dark → light, then shared highlight. Procreate palettes hold **30** colors, and rampart warns you when a palette goes over.

- **iPad, served over HTTPS:** **Share to Procreate…** opens the share sheet. Pick Procreate and the palette appears in *Palettes*.
- **iPad, plain HTTP:** the share sheet needs a secure context, so the file downloads to Files instead. Tap it there to import. Putting rampart behind your reverse proxy with TLS (e.g. Nginx Proxy Manager) enables the share button.
- **Desktop:** download, then AirDrop it or drop it into iCloud Drive and tap it on the iPad.
- **.ase** is a fallback. Procreate imports Adobe Swatch Exchange files as well.

Other formats: `.gpl` (Aseprite, GIMP, Krita), `.hex` (Lospec), a 1px-per-color PNG (Aseprite can load a palette from it), and a PNG of the swatch cross.

## Self-hosting

```yaml
# docker-compose.yml
services:
  rampart:
    image: ghcr.io/therebelrobot/rampart:latest
    restart: unless-stopped
    ports: ["8080:8080"]
    read_only: true
```

The image is multi-arch (`linux/amd64`, `linux/arm64`, so it runs on a Raspberry Pi), runs as the unprivileged `node` user, has no runtime `node_modules`, and exposes `/healthz`. Environment variables: `PORT` (default `8080`), `HOST` (default `0.0.0.0`).

To add it to the iPad home screen: Safari → Share → *Add to Home Screen*. It runs full-screen.

## Development

```sh
npm install
npm run dev          # Vite dev server (reachable on the LAN)
npm test             # engine, export-format, and storage tests
npm run build        # dist/public (client) + dist/server.mjs (single-file server)
npm start            # serve the build on :8080
```

Releases: `npm run release:patch | minor | major` tags `vX.Y.Z` and pushes it. `.github/workflows/release.yml` then builds the multi-arch image, pushes it to GHCR, and attaches signed build provenance. All actions are pinned to commit SHAs, and Dependabot keeps them current.

Layout:

```
src/color/      convert (HSB, OKLab), random (seeded), settings, generate (the engine), extract (image k-means)
src/export/     zip (store-only writer), formats (.swatches/.ase/.gpl/.hex), deliver (download/share)
src/render/     swatch-cross layout, canvas drawing (PNG export, test spheres)
src/storage/    library (localStorage, JSON import/export, URL recipe encoding)
src/components/ UI
server/         zero-dependency static server
```

## Manual test checklist

Some of this can only be checked on real devices:

- [ ] iPad Safari: download `.swatches` → Files → tap → palette appears in Procreate with the right name and colors in ramp order.
- [ ] iPad over HTTPS: **Share to Procreate…** appears, and picking Procreate imports the palette.
- [ ] `.ase` import in Procreate works as a fallback.
- [ ] `.gpl` loads in Aseprite (*Palette → Load Palette*). The 1px PNG loads as a palette too.
- [ ] iPad: the midtone color well opens the system color picker, and sliders drag smoothly without scrolling the page.
- [ ] iPad portrait: the palette stays pinned at the top while scrolling the controls.
- [ ] Save on desktop → Export all (JSON) → Import on iPad → palettes appear, and re-importing the same file skips duplicates.
- [ ] Home-screen install launches standalone, and the last palette is restored.

## License

[Unlicense](LICENSE): public domain.
