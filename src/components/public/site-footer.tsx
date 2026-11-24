import Link from "next/link";

export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`mt-auto border-t border-paper-200 bg-paper-100/60 ${className}`}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div>
          <p className="font-display text-sm font-semibold text-ink-900">Kelas X RPL 1</p>
          <p className="mt-1 text-xs text-ink-400">
            Jadwal berganti otomatis setiap pukul 19.00 WIB.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-400">
          <Link href="/" className="py-2 transition-colors hover:text-ink-900">
            Beranda
          </Link>
          <Link href="/jadwal" className="py-2 transition-colors hover:text-ink-900">
            Jadwal &amp; Tugas
          </Link>
          <Link href="/admin" className="py-2 transition-colors hover:text-ink-900">
            Masuk Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}
