import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { findFile } from "@/lib/uploads";

// GET /api/film/[id] — public download of one uploaded file.
//
// # DECISION: always served as an attachment with a generic content type
// and `nosniff` — rationale: uploads are unauthenticated, so anyone can put
// any bytes here; serving them inline (e.g. an uploaded .html) would let an
// upload run script on this app's origin. Forcing download avoids that.
// Reversal cost: low.
type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const file = await findFile(id);
  if (!file) {
    return new Response("Not found", { status: 404 });
  }

  const stream = Readable.toWeb(createReadStream(file.path)) as ReadableStream;
  const asciiName = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");

  return new Response(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
