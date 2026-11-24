import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/admin/auth-form";
import { countAdmins, getCurrentAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Masuk Admin — X RPL 1",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  const admin = await getCurrentAdmin();
  if (admin) redirect("/admin");

  const needsSetup = (await countAdmins()) === 0;

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-md bg-ink-900 font-display text-[13px] font-semibold text-paper-50"
          >
            X
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-[15px] font-semibold text-ink-900">RPL Satu</span>
            <span className="mt-1 text-[10px] tracking-[0.18em] text-ink-400 uppercase">
              Area Admin
            </span>
          </span>
        </Link>

        <h1 className="text-2xl font-semibold text-ink-950">
          {needsSetup ? "Buat akun admin pertama" : "Masuk sebagai admin"}
        </h1>
        <p className="mt-1.5 mb-6 text-[13px] leading-relaxed text-ink-500">
          {needsSetup
            ? "Belum ada akun admin. Buat satu akun untuk mulai mengelola jadwal dan tugas."
            : "Halaman ini hanya untuk pengelola kelas. Jadwal dan tugas tetap bisa dilihat publik tanpa login."}
        </p>

        <AuthForm mode={needsSetup ? "setup" : "login"} />

        <p className="mt-6 text-center text-[12px] text-ink-400">
          <Link href="/" className="hover:text-ink-900">
            ← Kembali ke halaman publik
          </Link>
        </p>
      </div>
    </div>
  );
}
