import Link from "next/link";

export function SiteHeader({ className = "", active }: { className?: string; active?: "beranda" | "jadwal" }) {
  const links: { href: string; label: string; key: "beranda" | "jadwal" }[] = [
    { href: "/", label: "Beranda", key: "beranda" },
    { href: "/jadwal", label: "Jadwal & Tugas", key: "jadwal" },
  ];

  return (
    <header className={`border-b border-paper-200 ${className}`}>
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="group flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-md bg-ink-900 font-display text-[13px] font-semibold text-paper-50 transition-transform duration-300 group-hover:-rotate-3"
          >
            X
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-[15px] font-semibold tracking-tight text-ink-900">
              RPL Satu
            </span>
            <span className="mt-1 text-[10px] font-medium tracking-[0.18em] text-ink-400 uppercase">
              Kelas X RPL 1
            </span>
          </span>
        </Link>

        <nav aria-label="Navigasi utama" className="flex items-center gap-1">
          {links.map((link) => {
            const isActive = active === link.key;
            return (
              <Link
                key={link.key}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-paper-200 font-medium text-ink-900"
                    : "text-ink-500 hover:bg-paper-100 hover:text-ink-900",
                ].join(" ")}
              >
                {link.label}
              </Link>
            );
          })}
          <Link
            href="/admin"
            className="ml-1 hidden rounded-md border border-paper-300 px-3 py-2 text-sm text-ink-500 transition-colors hover:border-ink-700 hover:text-ink-900 sm:inline-block"
          >
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
