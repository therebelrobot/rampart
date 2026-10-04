/**
 * Zero-dependency static server for the built client.
 *
 * rampart is entirely client-side (palettes live in the browser's
 * localStorage), so the server's only job is to serve files safely:
 * no path traversal, correct MIME types, long-lived caching for hashed
 * assets, no caching for index.html, and a /healthz for Docker.
 */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";
// resolved from the working directory, not import.meta.url, because esbuild flattens module location
const publicDirectory = resolve(process.cwd(), process.env.PUBLIC_DIR ?? "dist/public");

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "SAMEORIGIN",
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
};

async function resolveFile(urlPath: string): Promise<string | null> {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  const candidatePath = normalize(join(publicDirectory, decodedPath));
  if (candidatePath !== publicDirectory && !candidatePath.startsWith(publicDirectory + sep)) return null;
  try {
    const fileStats = await stat(candidatePath);
    if (fileStats.isFile()) return candidatePath;
    if (fileStats.isDirectory()) {
      const indexPath = join(candidatePath, "index.html");
      if ((await stat(indexPath)).isFile()) return indexPath;
    }
  } catch {
    /* fall through */
  }
  return null;
}

const server = createServer(async (request, response) => {
  const urlPath = request.url ?? "/";
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD", ...securityHeaders }).end();
    return;
  }
  if (urlPath === "/healthz") {
    response.writeHead(200, { "Content-Type": "text/plain", ...securityHeaders }).end("ok");
    return;
  }
  // unknown paths fall back to the app shell (single-page app)
  const filePath = (await resolveFile(urlPath)) ?? (extname(urlPath.split("?")[0]) ? null : join(publicDirectory, "index.html"));
  if (!filePath) {
    response.writeHead(404, { "Content-Type": "text/plain", ...securityHeaders }).end("Not found");
    return;
  }
  const isHashedAsset = filePath.includes(`${sep}assets${sep}`);
  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
    "Cache-Control": isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache",
    ...securityHeaders,
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath)
    .on("error", () => response.destroy())
    .pipe(response);
});

server.listen(port, host, () => {
  console.log(`rampart listening on http://${host}:${port} (serving ${publicDirectory})`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
