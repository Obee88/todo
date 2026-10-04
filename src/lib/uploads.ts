import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

// File storage for the public /film page: uploaded files live as plain files
// in UPLOAD_DIR on the server's disk.
//
// # DECISION: store on local disk (streamed, never buffered in memory)
// rather than in Postgres — rationale: the page is for films, i.e. large
// files, and bytea rows would have to be loaded into memory whole (and cap
// at 1 GB). Trade-off: the container's filesystem is replaced on every
// deploy, so UPLOAD_DIR must be a mounted volume for files to survive
// redeploys. Reversal cost: medium (data migration).
//
// On-disk name is `<id>--<safe original name>`; `id` (timestamp + random
// hex) makes names unique and is the only thing a download URL carries, so
// a client-supplied name is never used to build a path for reading.

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads");

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 2048);
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

const ID_RE = /^[0-9]{13}-[0-9a-f]{8}$/;
const SEP = "--";

export type StoredFile = {
  id: string;
  name: string;
  size: number;
  uploadedAt: Date;
};

export class UploadTooLargeError extends Error {}

/**
 * Reduces a client-supplied filename to something safe to put on disk and in
 * a Content-Disposition header: no directory parts, no control characters,
 * no path separators, bounded length.
 */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim()
    .replace(/^\.+/, "");
  const limited = cleaned.slice(0, 200);
  return limited || "file";
}

function parseEntry(entry: string): { id: string; name: string } | null {
  const i = entry.indexOf(SEP);
  if (i === -1) return null;
  const id = entry.slice(0, i);
  if (!ID_RE.test(id)) return null;
  return { id, name: entry.slice(i + SEP.length) };
}

export function isValidFileId(id: string): boolean {
  return ID_RE.test(id);
}

/** All stored files, newest first. Temp files from in-flight uploads are skipped. */
export async function listFiles(dir = UPLOAD_DIR): Promise<StoredFile[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const files = await Promise.all(
    entries.map(async (entry) => {
      const parsed = parseEntry(entry);
      if (!parsed) return null;
      const s = await stat(join(dir, entry)).catch(() => null);
      if (!s?.isFile()) return null;
      return { ...parsed, size: s.size, uploadedAt: s.mtime };
    })
  );
  return files
    .filter((f): f is StoredFile => f !== null)
    .sort((a, b) => b.id.localeCompare(a.id));
}

/** Looks a file up by id; returns its absolute path and metadata, or null. */
export async function findFile(
  id: string,
  dir = UPLOAD_DIR
): Promise<(StoredFile & { path: string }) | null> {
  if (!isValidFileId(id)) return null;
  const file = (await listFiles(dir)).find((f) => f.id === id);
  return file ? { ...file, path: join(dir, `${file.id}${SEP}${file.name}`) } : null;
}

/**
 * Streams `body` to disk under a temp name, enforcing `maxBytes` while
 * streaming, then renames it into place so listings never show a partial
 * file. Throws UploadTooLargeError (and removes the partial file) if the
 * body exceeds the limit.
 */
export async function saveUpload(
  rawName: string,
  body: WebReadableStream<Uint8Array> | ReadableStream<Uint8Array>,
  { dir = UPLOAD_DIR, maxBytes = MAX_UPLOAD_BYTES } = {}
): Promise<StoredFile> {
  await mkdir(dir, { recursive: true });
  const id = `${Date.now()}-${randomBytes(4).toString("hex")}`;
  const name = sanitizeFileName(rawName);
  const tmpPath = join(dir, `.tmp-${id}`);

  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > maxBytes) cb(new UploadTooLargeError());
      else cb(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(body as WebReadableStream<Uint8Array>),
      limiter,
      createWriteStream(tmpPath, { flags: "wx" })
    );
    await rename(tmpPath, join(dir, `${id}${SEP}${name}`));
  } catch (err) {
    await rm(tmpPath, { force: true });
    throw err;
  }

  return { id, name, size, uploadedAt: new Date() };
}
