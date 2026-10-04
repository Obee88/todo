import type { Metadata } from "next";

import { MAX_UPLOAD_BYTES, listFiles } from "@/lib/uploads";
import UploadButton from "./UploadButton";
import { formatBytes } from "./formatBytes";

export const metadata: Metadata = { title: "Film" };

// Always read the upload directory at request time.
export const dynamic = "force-dynamic";

// /film — public (no sign-in) page: upload a file to the server, and
// download any previously uploaded file from the list below.
export default async function FilmPage() {
  const files = await listFiles();

  return (
    <main className="flex min-h-screen flex-col items-center p-4 sm:p-8">
      <div className="w-full max-w-lg space-y-6">
        <h1 className="text-2xl font-semibold">Film</h1>

        <UploadButton maxBytes={MAX_UPLOAD_BYTES} />

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Uploaded files
          </h2>
          {files.length === 0 ? (
            <p className="text-sm text-gray-500">No files uploaded yet.</p>
          ) : (
            <ul className="divide-y divide-gray-200 rounded border border-gray-200">
              {files.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center gap-3 px-3 py-2 motion-safe:animate-row-in"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {formatBytes(file.size)} ·{" "}
                      {file.uploadedAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                    </p>
                  </div>
                  <a
                    href={`/api/film/${file.id}`}
                    download={file.name}
                    className="shrink-0 rounded px-2 py-1 text-sm font-medium text-green-700 transition hover:bg-green-50"
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
