"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[page-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper-50 px-5">
      <div className="w-full max-w-md rounded-xl border border-paper-300 bg-white px-5 py-6">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-ink-400 uppercase">
          Terjadi kesalahan
        </p>
        <h1 className="mt-1 font-display text-xl font-semibold text-ink-950">
          Halaman gagal dimuat
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
          Data kelas tidak bisa diambil saat ini. Coba muat ulang sebentar lagi. Jika terus
          terjadi, hubungi admin kelas.
        </p>
        {error.digest && (
          <p className="mt-3 rounded-md bg-paper-100 px-3 py-2 text-[11px] text-ink-500">
            Kode kesalahan: <span className="tabular font-medium text-ink-700">{error.digest}</span>
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-md bg-ink-950 px-3.5 py-2 text-[12px] font-medium text-paper-50 transition-colors hover:bg-ink-800"
        >
          Coba lagi
        </button>
      </div>
    </div>
  );
}
