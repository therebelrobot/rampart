/**
 * Getting files out of the browser, on desktop and iPad.
 *
 * On iPad, the share sheet is the lowest-friction path into Procreate (tap
 * "Procreate" in the sheet and the palette lands in the Palettes panel). It
 * needs a secure context (HTTPS or localhost), so on plain-HTTP LAN installs we
 * fall back to a normal download: Safari saves it to Files, and tapping the
 * file there opens it in Procreate.
 */

export function downloadBytes(bytes: Uint8Array | string, fileName: string, mimeType: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
}

export function canShareFiles(): boolean {
  try {
    if (typeof navigator === "undefined" || !navigator.canShare || !window.isSecureContext) return false;
    const probeFile = new File([new Uint8Array([0])], "probe.swatches", { type: "application/octet-stream" });
    return navigator.canShare({ files: [probeFile] });
  } catch {
    return false;
  }
}

/** Returns false if sharing was unavailable or failed (caller should download instead). */
export async function shareBytes(bytes: Uint8Array, fileName: string, title: string): Promise<boolean> {
  try {
    const file = new File([bytes as BlobPart], fileName, { type: "application/octet-stream" });
    if (!navigator.canShare?.({ files: [file] })) return false;
    await navigator.share({ files: [file], title });
    return true;
  } catch (shareError) {
    // the user dismissing the sheet is not a failure worth a fallback download
    if (shareError instanceof DOMException && shareError.name === "AbortError") return true;
    return false;
  }
}

export async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not encode PNG");
  return new Uint8Array(await blob.arrayBuffer());
}
