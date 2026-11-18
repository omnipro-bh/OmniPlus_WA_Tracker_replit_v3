import fs from "fs";
import path from "path";

/**
 * Uploads directory bundled inside the git checkout.
 *
 * It doubles as the seed source: files committed here come back after every
 * deploy, so they can be copied into a fresh persistent volume.
 */
const BUNDLED_UPLOADS_DIR = path.join(process.cwd(), "uploads");

/**
 * Root directory for user-uploaded media (images, video, documents).
 *
 * Defaults to `<cwd>/uploads`. Set `UPLOADS_DIR` to an absolute path on a
 * mounted persistent volume so uploads survive redeploys — the checkout is
 * recreated from scratch on every deploy, which wipes anything written at
 * runtime.
 */
export const UPLOADS_ROOT = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : BUNDLED_UPLOADS_DIR;

/** URL prefix the app serves uploads under. */
export const UPLOADS_URL_PREFIX = "/uploads";

/**
 * How to answer a request for a media file that is not on disk.
 *
 * `404` (default) surfaces the problem: monitoring and logs see it, and the
 * browser shows a broken image instead of silently rendering HTML.
 *
 * `placeholder` returns a neutral SVG with a 200 for image requests, so the
 * layout keeps its shape when a file goes missing. Non-image requests still
 * 404 — an SVG would break a video player or a PDF viewer.
 */
export const UPLOADS_MISSING_MEDIA =
  process.env.UPLOADS_MISSING_MEDIA === "placeholder" ? "placeholder" : "404";

const IMAGE_EXTENSIONS = new Set([
  ".avif", ".bmp", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp",
]);

/** True for request paths that a browser renders as an image. */
export function isImagePath(requestPath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(requestPath).toLowerCase());
}

/** Neutral stand-in served for missing images when the placeholder mode is on. */
export const MISSING_MEDIA_PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180" role="img" aria-label="Image unavailable">' +
  '<rect width="320" height="180" fill="#f1f5f9"/>' +
  '<rect x="0.5" y="0.5" width="319" height="179" fill="none" stroke="#cbd5e1"/>' +
  '<circle cx="126" cy="64" r="12" fill="#cbd5e1"/>' +
  '<path d="M104 126l30-40 24 28 17-22 37 48z" fill="#cbd5e1"/>' +
  '<text x="160" y="158" font-family="system-ui,-apple-system,sans-serif" font-size="13" fill="#64748b" text-anchor="middle">Image unavailable</text>' +
  "</svg>";

/** Absolute path for a file inside the uploads root, or null if it escapes it. */
export function resolveUploadPath(...segments: string[]): string | null {
  const target = path.resolve(UPLOADS_ROOT, ...segments);
  const root = path.resolve(UPLOADS_ROOT);
  // Reject `..` traversal so a crafted media URL can't read arbitrary files.
  return target === root || target.startsWith(root + path.sep) ? target : null;
}

function copyDirIfMissing(sourceDir: string, targetDir: string): number {
  let copied = 0;

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      copied += copyDirIfMissing(source, target);
      continue;
    }

    // .gitkeep is a placeholder; never overwrite a real runtime upload.
    if (!entry.isFile() || entry.name === ".gitkeep") continue;
    if (fs.existsSync(target)) continue;

    fs.copyFileSync(source, target);
    copied += 1;
  }

  return copied;
}

/**
 * Prepare the uploads root at boot.
 *
 * Creates the directory and, when `UPLOADS_DIR` points at an empty volume,
 * seeds it with the files committed in the checkout. Without this, mounting a
 * volume would hide the bundled `use-cases` images that existing records point
 * at, so those images would break even though the volume works.
 *
 * Never throws: a failed volume must not stop the app from starting.
 */
export function ensureUploadsRoot(): void {
  try {
    fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
  } catch (error) {
    console.error(`[Uploads] Could not create ${UPLOADS_ROOT}:`, error);
    return;
  }

  // Using the bundled directory directly: nothing to seed.
  if (path.resolve(UPLOADS_ROOT) === path.resolve(BUNDLED_UPLOADS_DIR)) return;
  if (!fs.existsSync(BUNDLED_UPLOADS_DIR)) return;

  try {
    const copied = copyDirIfMissing(BUNDLED_UPLOADS_DIR, UPLOADS_ROOT);
    if (copied > 0) {
      console.log(`[Uploads] Seeded ${copied} bundled file(s) into ${UPLOADS_ROOT}`);
    }
  } catch (error) {
    console.error(`[Uploads] Seeding from ${BUNDLED_UPLOADS_DIR} failed:`, error);
  }
}
