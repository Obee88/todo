"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { formatBytes } from "./formatBytes";

// Upload button for /film. Uses XMLHttpRequest rather than fetch() because
// XHR reports upload progress, which matters for film-sized files. The file
// is sent as the raw request body (see src/app/api/film/route.ts).
export default function UploadButton({ maxBytes }: { maxBytes: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function upload(file: File) {
    setError(null);
    if (file.size > maxBytes) {
      setError(`File is too large (max ${formatBytes(maxBytes)}).`);
      return;
    }
    setFileName(file.name);
    setProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/film?name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status === 201) {
        router.refresh();
        return;
      }
      let message = "Upload failed.";
      try {
        message = JSON.parse(xhr.responseText).error ?? message;
      } catch {}
      setError(message);
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Upload failed. Check your connection and try again.");
    };
    xhr.send(file);
  }

  const uploading = progress !== null;

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="w-full rounded bg-gray-900 px-4 py-3 font-medium text-white transition hover:bg-gray-700 active:scale-[0.99] disabled:opacity-50"
      >
        {uploading ? "Uploading…" : "Upload file"}
      </button>
      {uploading && (
        <div className="space-y-1">
          <div className="flex justify-between gap-4 text-sm text-gray-600">
            <span className="min-w-0 truncate">{fileName}</span>
            <span className="shrink-0 tabular-nums">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-gray-200">
            <div
              className="h-full bg-green-600 transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
