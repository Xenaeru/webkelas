"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import {
  Field,
  GhostButton,
  Panel,
  PrimaryButton,
  TextInput,
} from "@/components/admin/form-controls";
import { apiRequest, RequestError } from "@/lib/api-client";
import type { ScheduleSettings } from "@/lib/repository";
import type { ScheduleMode } from "@/lib/schedule-version";
import { resolveScheduleContext, weekInfoFor, jakartaDateKey } from "@/lib/schedule-version";

const MODES: { value: ScheduleMode; label: string; description: string }[] = [
  {
    value: "AUTO",
    label: "Otomatis",
    description: "Jadwal A pada minggu 1–2, Jadwal B pada minggu 3 dan seterusnya.",
  },
  {
    value: "EXAM",
    label: "Mode Ujian",
    description: "Gunakan jadwal ujian. Aktif selama periode ujian atau sampai dimatikan.",
  },
  {
    value: "MANUAL_A",
    label: "Manual Jadwal A",
    description: "Paksa Jadwal A setiap saat, mengabaikan perhitungan minggu.",
  },
  {
    value: "MANUAL_B",
    label: "Manual Jadwal B",
    description: "Paksa Jadwal B setiap saat, mengabaikan perhitungan minggu.",
  },
];

export function ScheduleModePanel({ initialSettings }: { initialSettings: ScheduleSettings }) {
  const toast = useToast();
  const [settings, setSettings] = useState<ScheduleSettings>(initialSettings);

  const [mode, setMode] = useState<ScheduleMode>(initialSettings.mode);
  const [examEnabled, setExamEnabled] = useState(initialSettings.examEnabled);
  const [examStartDate, setExamStartDate] = useState(initialSettings.examStartDate ?? "");
  const [examEndDate, setExamEndDate] = useState(initialSettings.examEndDate ?? "");

  const [pending, setPending] = useState<ScheduleMode | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const now = new Date();
  const current = resolveScheduleContext(now, settings);
  const nowWeek = weekInfoFor(jakartaDateKey(now));

  const dirty =
    mode !== settings.mode ||
    examEnabled !== settings.examEnabled ||
    examStartDate !== (settings.examStartDate ?? "") ||
    examEndDate !== (settings.examEndDate ?? "");

  function requestMode(next: ScheduleMode) {
    if (next === mode) return;
    // Switching mode is destructive enough to warrant an explicit confirmation.
    setPending(next);
  }

  function confirmMode() {
    if (!pending) return;
    setMode(pending);
    if (pending === "EXAM") setExamEnabled(true);
    if (pending !== "EXAM" && mode === "EXAM") setExamEnabled(false);
    setPending(null);
  }

  async function save() {
    setSaving(true);
    setErrors({});
    try {
      const result = await apiRequest<{ settings: ScheduleSettings }>("/api/schedule-settings", {
        method: "PUT",
        body: {
          mode,
          examEnabled,
          examStartDate: examStartDate || null,
          examEndDate: examEndDate || null,
        },
      });
      setSettings(result.settings);
      setMode(result.settings.mode);
      setExamEnabled(result.settings.examEnabled);
      setExamStartDate(result.settings.examStartDate ?? "");
      setExamEndDate(result.settings.examEndDate ?? "");
      toast.push("Pengaturan mode jadwal disimpan");
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

  const pendingLabel = MODES.find((m) => m.value === pending)?.label;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="text-[10px] font-semibold tracking-[0.2em] text-ink-400 uppercase">
          Pengaturan Mode Jadwal
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-ink-950">Jadwal mana yang tampil</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-500">
          Prioritas: mode ujian (bila aktif dan tanggalnya cocok) → manual A/B → otomatis
          berdasarkan minggu. Minggu ini adalah{" "}
          <span className="font-medium text-ink-900">minggu ke-{nowWeek.weekOfMonth}</span>,
          sehingga otomatis memakai{" "}
          <span className="font-medium text-ink-900">Jadwal {nowWeek.version}</span>.
        </p>
      </header>

      <Panel
        title="Mode aktif"
        description="Mengganti mode akan mengubah jadwal yang dilihat siswa pada halaman publik."
        action={
          <span className="tabular rounded-full border border-paper-300 px-2.5 py-0.5 text-[10px] font-medium text-ink-500 uppercase">
            Kini: {current.active.label}
          </span>
        }
      >
        <div role="radiogroup" aria-label="Mode jadwal" className="grid gap-2 sm:grid-cols-2">
          {MODES.map((option) => {
            const isSelected = mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => requestMode(option.value)}
                className={[
                  "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  isSelected
                    ? "border-ink-900 bg-ink-900 text-paper-50"
                    : "border-paper-300 bg-white text-ink-700 hover:border-ink-400",
                ].join(" ")}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold">{option.label}</span>
                  {isSelected && (
                    <span className="text-[10px] tracking-wide text-paper-200/80 uppercase">
                      Dipilih
                    </span>
                  )}
                </span>
                <span
                  className={[
                    "text-[11px] leading-relaxed",
                    isSelected ? "text-paper-200/75" : "text-ink-400",
                  ].join(" ")}
                >
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>

        {pending && (
          <div className="mt-3 rounded-lg border border-clay-200 bg-clay-50 px-3 py-2.5">
            <p className="text-[12px] font-medium text-clay-600">
              Ganti mode ke “{pendingLabel}”?
            </p>
            <p className="mt-0.5 text-[11px] text-clay-600/80">
              Perubahan ini mengubah jadwal yang tampil untuk semua siswa. Klik simpan setelah
              konfirmasi.
            </p>
            <div className="mt-2 flex gap-2">
              <PrimaryButton type="button" onClick={confirmMode}>
                Ya, ganti mode
              </PrimaryButton>
              <GhostButton type="button" onClick={() => setPending(null)}>
                Batal
              </GhostButton>
            </div>
          </div>
        )}
      </Panel>

      <Panel
        title="Periode ujian"
        description="Selama tanggal hari ini berada dalam rentang ini, jadwal ujian dipakai tanpa mengubah mode manual."
      >
        <div className="flex flex-col gap-3">
          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={examEnabled}
              onChange={(e) => setExamEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-paper-300 text-ink-900"
            />
            <span>
              <span className="block text-[13px] font-medium text-ink-900">
                Aktifkan mode ujian
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-400">
                Tanpa tanggal, mode ujian berjalan terus sampai dimatikan. Dengan tanggal, mode
                ujian otomatis berhenti setelah tanggal selesai.
              </span>
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tanggal mulai (opsional)" htmlFor="exam-start">
              <TextInput
                id="exam-start"
                type="date"
                value={examStartDate}
                onChange={(e) => setExamStartDate(e.target.value)}
              />
            </Field>
            <Field label="Tanggal selesai (opsional)" htmlFor="exam-end">
              <TextInput
                id="exam-end"
                type="date"
                value={examEndDate}
                onChange={(e) => setExamEndDate(e.target.value)}
              />
            </Field>
          </div>

          {errors.examEndDate && (
            <ul className="flex flex-col gap-0.5">
              {errors.examEndDate.map((message) => (
                <li key={message} className="text-[11px] text-clay-600">
                  {message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <PrimaryButton type="button" onClick={save} disabled={saving || !dirty}>
          {saving ? "Menyimpan…" : "Simpan pengaturan"}
        </PrimaryButton>
        {!dirty && !saving && (
          <span className="text-[11px] text-ink-400">Belum ada perubahan.</span>
        )}
      </div>
    </div>
  );
}
