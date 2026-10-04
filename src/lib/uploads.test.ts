import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  UploadTooLargeError,
  findFile,
  listFiles,
  sanitizeFileName,
  saveUpload,
} from "./uploads";

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  });
}

describe("sanitizeFileName", () => {
  it("given a path with directories, when sanitized, then only the base name remains", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\me\\movie.mp4")).toBe("movie.mp4");
  });

  it("given control and reserved characters, when sanitized, then they are removed or replaced", () => {
    expect(sanitizeFileName('a\u0000b\nc<d>"e.mkv')).toBe("abc_d__e.mkv");
  });

  it("given a leading-dot or empty name, when sanitized, then it is not hidden and never empty", () => {
    expect(sanitizeFileName(".hidden")).toBe("hidden");
    expect(sanitizeFileName("")).toBe("file");
    expect(sanitizeFileName("../")).toBe("file");
  });

  it("given a very long name, when sanitized, then it is capped at 200 characters", () => {
    expect(sanitizeFileName("x".repeat(500))).toHaveLength(200);
  });
});

describe("saveUpload / listFiles / findFile", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "film-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("given an upload, when saved, then it is listed with its name and size and can be found by id", async () => {
    const saved = await saveUpload("My Film.mp4", streamOf("hello ", "world"), { dir });

    expect(saved.name).toBe("My Film.mp4");
    expect(saved.size).toBe(11);

    const files = await listFiles(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ id: saved.id, name: "My Film.mp4", size: 11 });

    const found = await findFile(saved.id, dir);
    expect(found?.path).toBe(join(dir, `${saved.id}--My Film.mp4`));
  });

  it("given an upload over the size limit, when saved, then it throws and leaves no file (not even a temp file)", async () => {
    await expect(
      saveUpload("big.bin", streamOf("12345", "67890"), { dir, maxBytes: 8 })
    ).rejects.toBeInstanceOf(UploadTooLargeError);

    expect(await readdir(dir)).toEqual([]);
  });

  it("given several uploads, when listed, then newest comes first", async () => {
    const a = await saveUpload("a.txt", streamOf("a"), { dir });
    await new Promise((r) => setTimeout(r, 5));
    const b = await saveUpload("b.txt", streamOf("b"), { dir });

    expect((await listFiles(dir)).map((f) => f.id)).toEqual([b.id, a.id]);
  });

  it("given stray files that are not uploads (temp files, foreign names), when listed, then they are ignored", async () => {
    await writeFile(join(dir, ".tmp-1700000000000-deadbeef"), "partial");
    await writeFile(join(dir, "random.txt"), "x");

    expect(await listFiles(dir)).toEqual([]);
  });

  it("given a malformed or traversal id, when looked up, then nothing is found", async () => {
    await saveUpload("a.txt", streamOf("a"), { dir });

    expect(await findFile("../a.txt", dir)).toBeNull();
    expect(await findFile("not-an-id", dir)).toBeNull();
    expect(await findFile("1700000000000-00000000", dir)).toBeNull();
  });

  it("given a missing upload directory, when listed, then it returns an empty list", async () => {
    expect(await listFiles(join(dir, "nope"))).toEqual([]);
  });
});
