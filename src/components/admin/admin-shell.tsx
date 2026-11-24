"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: "▦" },
  { href: "/admin/jadwal", label: "Kelola Jadwal", icon: "▤" },
  { href: "/admin/mode-jadwal", label: "Mode Jadwal", icon: "◐" },
  { href: "/admin/tugas", label: "Kelola Tugas", icon: "✓" },
  { href: "/admin/pengaturan", label: "Pengaturan Kelas", icon: "⚙" },
];

export function AdminShell({ username, children }: { username: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/admin/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const navLinks = (
    <nav aria-label="Navigasi admin" className="flex flex-col gap-0.5">
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setMenuOpen(false)}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={[
            "flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors",
            isActive(item.href)
              ? "bg-ink-900 font-medium text-paper-50"
              : "text-ink-500 hover:bg-paper-200 hover:text-ink-900",
          ].join(" ")}
        >
          <span aria-hidden className="w-4 text-center text-[13px]">
            {item.icon}
          </span>
          {item.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-paper-100/50">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-paper-200 bg-paper-50/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-md bg-ink-900 font-display text-[12px] font-semibold text-paper-50"
          >
            X
          </span>
          <span className="text-[13px] font-semibold text-ink-900">Admin Kelas</span>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-controls="admin-mobile-nav"
          className="rounded-md border border-paper-300 px-3 py-1.5 text-[12px] font-medium text-ink-700"
        >
          {menuOpen ? "Tutup" : "Menu"}
        </button>
      </div>

      {menuOpen && (
        <div id="admin-mobile-nav" className="animate-fade border-b border-paper-200 bg-paper-50 px-4 py-3 lg:hidden">
          {navLinks}
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            className="mt-2 w-full rounded-md border border-paper-300 px-3 py-2 text-left text-[13px] text-ink-500 disabled:opacity-50"
          >
            {loggingOut ? "Keluar…" : "Logout"}
          </button>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:py-8">
        {/* Desktop sidebar */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-8">
            <Link href="/" className="mb-6 flex items-center gap-2.5 px-1">
              <span
                aria-hidden
                className="flex h-8 w-8 items-center justify-center rounded-md bg-ink-900 font-display text-[13px] font-semibold text-paper-50"
              >
                X
              </span>
              <span className="flex flex-col leading-none">
                <span className="font-display text-[15px] font-semibold text-ink-900">RPL Satu</span>
                <span className="mt-1 text-[10px] tracking-[0.16em] text-ink-400 uppercase">
                  Area Admin
                </span>
              </span>
            </Link>

            {navLinks}

            <div className="mt-6 border-t border-paper-300 pt-4">
              <p className="px-3 text-[10px] tracking-[0.14em] text-ink-400 uppercase">
                Masuk sebagai
              </p>
              <p className="mt-1 truncate px-3 text-[13px] font-medium text-ink-900">{username}</p>
              <div className="mt-3 flex flex-col gap-1">
                <Link
                  href="/"
                  className="rounded-md px-3 py-2 text-[12px] text-ink-500 transition-colors hover:bg-paper-200 hover:text-ink-900"
                >
                  Lihat situs publik
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  disabled={loggingOut}
                  className="rounded-md px-3 py-2 text-left text-[12px] text-ink-500 transition-colors hover:bg-paper-200 hover:text-clay-600 disabled:opacity-50"
                >
                  {loggingOut ? "Keluar…" : "Logout"}
                </button>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-12">{children}</main>
      </div>
    </div>
  );
}
