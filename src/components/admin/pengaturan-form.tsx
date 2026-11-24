"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import {
  Field,
  Panel,
  PrimaryButton,
  TextArea,
  TextInput,
} from "@/components/admin/form-controls";
import { apiRequest, RequestError } from "@/lib/api-client";
import type { ClassSettings } from "@/lib/repository";

export function PengaturanForm({ initialSettings }: { initialSettings: ClassSettings }) {
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setSaving(true);
    try {
      const result = await apiRequest<{ settings: ClassSettings }>("/api/settings", {
        method: "PUT",
        body: {
          className: form.className,
          description: form.description,
          homeroomTeacher: form.homeroomTeacher,
          academicYear: form.academicYear,
          announcement: form.announcement,
        },
      });
      setForm(result.settings);
      toast.push("Informasi kelas disimpan");
      router.refresh();
    } catch (error) {
      if (error instanceof RequestError) {
        setErrors(error.fieldErrors ?? {});
        toast.push(error.message, "error");
      } else {
        toast.push("Gagal menyimpan pengaturan", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  const messages = Object.values(errors).flat();

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="text-[10px] font-semibold tracking-[0.2em] text-ink-400 uppercase">
          Pengaturan Kelas
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-ink-950">Informasi kelas</h1>
        <p className="mt-1 text-[13px] text-ink-500">
          Data ini tampil di beranda dan header halaman jadwal publik.
        </p>
      </header>

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Panel title="Identitas kelas" description="Nama kelas wajib diisi.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nama kelas" htmlFor="className" required>
              <TextInput
                id="className"
                value={form.className}
                onChange={(e) => setForm({ ...form, className: e.target.value })}
                required
              />
            </Field>
            <Field label="Tahun ajaran" htmlFor="academicYear" hint="Contoh: 2026/2027">
              <TextInput
                id="academicYear"
                value={form.academicYear}
                onChange={(e) => setForm({ ...form, academicYear: e.target.value })}
                placeholder="2026/2027"
              />
            </Field>
            <Field label="Nama wali kelas" htmlFor="homeroomTeacher" hint="Opsional.">
              <TextInput
                id="homeroomTeacher"
                value={form.homeroomTeacher}
                onChange={(e) => setForm({ ...form, homeroomTeacher: e.target.value })}
                placeholder="Nama lengkap wali kelas"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Deskripsi kelas" htmlFor="description">
                <TextArea
                  id="description"
                  rows={4}
                  maxLength={2000}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Deskripsi singkat kelas yang tampil di beranda."
                />
              </Field>
            </div>
          </div>
        </Panel>

        <Panel
          title="Pengumuman"
          description="Tampil sebagai banner di beranda publik. Kosongkan untuk menyembunyikan banner."
        >
          <Field label="Isi pengumuman" htmlFor="announcement">
            <TextArea
              id="announcement"
              rows={4}
              maxLength={2000}
              value={form.announcement}
              onChange={(e) => setForm({ ...form, announcement: e.target.value })}
              placeholder="Contoh: Ujian tengah semester dimulai 1 Desember 2026."
            />
          </Field>
        </Panel>

        {messages.length > 0 && (
          <ul className="flex flex-col gap-0.5">
            {messages.map((message) => (
              <li key={message} className="text-[11px] text-clay-600">
                {message}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-3">
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Menyimpan…" : "Simpan pengaturan"}
          </PrimaryButton>
          {form.updatedAt && (
            <span className="text-[10px] text-ink-400">
              Terakhir diperbarui{" "}
              {new Date(form.updatedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
