import { NextResponse } from "next/server";

import {
  MAX_UPLOAD_BYTES,
  UploadTooLargeError,
  saveUpload,
} from "@/lib/uploads";

// POST /api/film?name=<filename> — public (no auth; excluded from
// middleware in src/middleware.ts). The request body is the raw file bytes,
// streamed straight to disk.
//
// # DECISION: raw body + `?name=` rather than multipart/form-data —
// rationale: `request.formData()` buffers the whole file in memory, which
// is a non-starter for film-sized uploads; a raw body can be piped to disk
// chunk by chunk. Reversal cost: low.
export async function POST(request: Request) {
  const name = new URL(request.url).searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "Missing file name" }, { status: 400 });
  }
  if (!request.body) {
    return NextResponse.json({ error: "Empty upload" }, { status: 400 });
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File is too large" }, { status: 413 });
  }

  try {
    const file = await saveUpload(name, request.body);
    return NextResponse.json(file, { status: 201 });
  } catch (err) {
    if (err instanceof UploadTooLargeError) {
      return NextResponse.json({ error: "File is too large" }, { status: 413 });
    }
    console.error("[film] upload failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
