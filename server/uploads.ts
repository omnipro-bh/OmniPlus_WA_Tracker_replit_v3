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
