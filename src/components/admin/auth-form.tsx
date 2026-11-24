"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AuthFormProps {
  mode: "login" | "setup";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isSetup = mode === "setup";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (isSetup && password !== confirm) {
      setError("Konfirmasi password tidak cocok");
      return;
    }

    setPending(true);
    try {
      const response = await fetch(isSetup ? "/api/auth/setup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = (await response.json()) as { error?: string; fieldErrors?: Record<string, string[]> };

      if (!response.ok) {
        const firstFieldError = payload.fieldErrors
          ? Object.values(payload.fieldErrors).flat()[0]
          : undefined;
        setError(firstFieldError ?? payload.error ?? "Gagal memproses permintaan");
        return;
      }

      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error && (
        <div
          role="alert"
          className="rounded-md border border-clay-200 bg-clay-50 px-3 py-2.5 text-[13px] text-clay-600"
        >
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="username" className="text-[12px] font-medium text-ink-700">
          Username
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="rounded-md border border-paper-300 bg-white px-3 py-2.5 text-sm text-ink-900 transition-colors outline-none focus:border-ink-700"
          placeholder="admin"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-[12px] font-medium text-ink-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={isSetup ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={isSetup ? 8 : undefined}
          className="rounded-md border border-paper-300 bg-white px-3 py-2.5 text-sm text-ink-900 transition-colors outline-none focus:border-ink-700"
          placeholder={isSetup ? "Minimal 8 karakter" : "••••••••"}
        />
      </div>

      {isSetup && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm" className="text-[12px] font-medium text-ink-700">
            Konfirmasi password
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="rounded-md border border-paper-300 bg-white px-3 py-2.5 text-sm text-ink-900 transition-colors outline-none focus:border-ink-700"
            placeholder="Ulangi password"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-md bg-ink-950 px-4 py-2.5 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Memproses…" : isSetup ? "Buat akun admin" : "Masuk"}
      </button>

      {isSetup && (
        <p className="text-[11px] leading-relaxed text-ink-400">
          Akun ini dibuat sekali dan disimpan dengan password ter-hash. Setelah dibuat, halaman setup
          tidak bisa dipakai lagi.
        </p>
      )}
    </form>
  );
}
