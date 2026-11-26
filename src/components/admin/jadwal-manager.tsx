"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import {
  DangerButton,
  Field,
  GhostButton,
  Panel,
  PrimaryButton,
  TextArea,
  TextInput,
} from "@/components/admin/form-controls";
import { apiRequest, RequestError } from "@/lib/api-client";
import {
  SCHOOL_DAY_NAMES,
  SCHOOL_DAY_SHORT,
  SCHOOL_DAYS,
  type SchoolWeekday,
} from "@/lib/schedule-day";
import type { DailySchedule, ScheduleItem, ScheduleSettings } from "@/lib/repository";
import { resolveScheduleContext, type ScheduleVersion } from "@/lib/schedule-version";

interface ItemDraft {
  subject: string;
  startTime: string;
  endTime: string;
  teacher: string;
  room: string;
  examDate: string;
}

const emptyDraft: ItemDraft = {
  subject: "",
  startTime: "",
  endTime: "",
  teacher: "",
  room: "",
  examDate: "",
};

function draftFromItem(item: ScheduleItem): ItemDraft {
  return {
    subject: item.subject,
    startTime: item.startTime,
    endTime: item.endTime,
    teacher: item.teacher,
    room: item.room,
    examDate: item.examDate ?? "",
  };
}

const VERSION_TABS: { value: ScheduleVersion; label: string; hint: string }[] = [
  { value: "A", label: "Jadwal A", hint: "Minggu 1–2" },
  { value: "B", label: "Jadwal B", hint: "Minggu 3–4+" },
  { value: "EXAM", label: "Jadwal Ujian", hint: "Saat mode ujian" },
];

export function JadwalManager({
  version,
  initialSchedules,
  scheduleSettings,
}: {
  version: ScheduleVersion;
  initialSchedules: DailySchedule[];
  scheduleSettings: ScheduleSettings;
}) {
  const toast = useToast();
  const router = useRouter();
  const [schedules, setSchedules] = useState<DailySchedule[]>(initialSchedules);
  const [day, setDay] = useState<SchoolWeekday>(1);

  const [draft, setDraft] = useState<ItemDraft>(emptyDraft);
  const [adding, setAdding] = useState(false);
  const [addErrors, setAddErrors] = useState<Record<string, string[]>>({});

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<ItemDraft>(emptyDraft);
  const [editErrors, setEditErrors] = useState<Record<string, string[]>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const [description, setDescription] = useState("");
  const [savingDescription, setSavingDescription] = useState(false);

  const [reordering, setReordering] = useState(false);

  const isExam = version === "EXAM";

  // Switching variant must reset the editor state for the newly loaded data.
  useEffect(() => {
    setSchedules(initialSchedules);
    setDay(1);
    setEditingId(null);
    setConfirmId(null);
    setDraft(emptyDraft);
    setAddErrors({});
  }, [initialSchedules, version]);

  const currentSchedule = schedules.find((s) => s.dayOfWeek === day) ?? null;
  const items = currentSchedule?.items ?? [];

  useEffect(() => {
    setDescription(currentSchedule?.description ?? "");
  }, [day, currentSchedule?.description]);

  const replaceSchedule = useCallback((updated: DailySchedule | null | undefined) => {
    if (!updated) return;
    setSchedules((prev) => prev.map((s) => (s.dayOfWeek === updated.dayOfWeek ? updated : s)));
  }, []);

  const switchVersion = (next: ScheduleVersion) => {
    if (next === version) return;
    router.push(`/admin/jadwal?version=${next}`);
  };

  async function addItem(event: React.FormEvent) {
    event.preventDefault();
    setAddErrors({});
    setAdding(true);
    try {
      const result = await apiRequest<{ item: ScheduleItem; schedule: DailySchedule }>(
        `/api/schedules?day=${day}&action=item&version=${version}`,
        { method: "POST", body: draft },
      );
      replaceSchedule(result.schedule);
      setDraft(emptyDraft);
      toast.push(`"${result.item.subject}" ditambahkan ke hari ${SCHOOL_DAY_NAMES[day]}`);
    } catch (error) {
      if (error instanceof RequestError) {
        setAddErrors(error.fieldErrors ?? {});
        toast.push(error.message, "error");
      } else {
        toast.push("Gagal menambahkan pelajaran", "error");
      }
    } finally {
      setAdding(false);
    }
  }

  function startEdit(item: ScheduleItem) {
    setEditingId(item.id);
    setEditDraft(draftFromItem(item));
    setEditErrors({});
    setConfirmId(null);
  }

  async function saveEdit(itemId: number) {
    setEditErrors({});
    setSavingEdit(true);
    try {
      const result = await apiRequest<{ item: ScheduleItem; schedule: DailySchedule | null }>(
        `/api/schedules/${itemId}`,
        { method: "PUT", body: editDraft },
      );
      replaceSchedule(result.schedule);
      setEditingId(null);
      toast.push("Perubahan tersimpan");
    } catch (error) {
      if (error instanceof RequestError) {
        setEditErrors(error.fieldErrors ?? {});
        toast.push(error.message, "error");
      } else {
        toast.push("Gagal menyimpan perubahan", "error");
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function removeItem(itemId: number, subject: string) {
    setDeletingId(itemId);
    try {
      const result = await apiRequest<{ deleted: boolean; schedule: DailySchedule | null }>(
        `/api/schedules/${itemId}`,
        { method: "DELETE" },
      );
      replaceSchedule(result.schedule);
      setConfirmId(null);
      toast.push(`"${subject}" dihapus`);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Gagal menghapus", "error");
    } finally {
      setDeletingId(null);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    const reordered = [...items];
    const [moved] = reordered.splice(index, 1);
    if (!moved) return;
    reordered.splice(target, 0, moved);

    const previous = items;
    setSchedules((prev) =>
      prev.map((s) =>
        s.dayOfWeek === day
          ? { ...s, items: reordered.map((item, i) => ({ ...item, sortOrder: i })) }
          : s,
      ),
    );
    setReordering(true);

    try {
      const result = await apiRequest<{ items: ScheduleItem[] }>(
        `/api/schedules?day=${day}&action=reorder&version=${version}`,
        { method: "POST", body: { orderedIds: reordered.map((item) => item.id) } },
      );
      setSchedules((prev) =>
        prev.map((s) => (s.dayOfWeek === day ? { ...s, items: result.items } : s)),
      );
    } catch (error) {
      setSchedules((prev) =>
        prev.map((s) => (s.dayOfWeek === day ? { ...s, items: previous } : s)),
      );
      toast.push(error instanceof Error ? error.message : "Gagal mengubah urutan", "error");
    } finally {
      setReordering(false);
    }
  }

  async function saveDescription(event: React.FormEvent) {
    event.preventDefault();
    setSavingDescription(true);
    try {
      const result = await apiRequest<{ schedule: DailySchedule }>(
        `/api/schedules?day=${day}&action=description&version=${version}`,
        { method: "POST", body: { description } },
      );
      replaceSchedule(result.schedule);
      toast.push(`Keterangan hari ${SCHOOL_DAY_NAMES[day]} disimpan`);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Gagal menyimpan keterangan", "error");
    } finally {
      setSavingDescription(false);
    }
  }

  const activeTab = VERSION_TABS.find((t) => t.value === version);
  const totalItems = useMemo(
    () => schedules.reduce((sum, s) => sum + s.items.length, 0),
    [schedules],
  );

  // Which variant is live right now, so the admin sees the effect of edits.
  const liveVersion = useMemo(() => {
    const context = resolveScheduleContext(new Date(), scheduleSettings);
    return { version: context.active.version, label: context.active.label };
  }, [scheduleSettings]);

  const isLive = liveVersion.version === version;

  // Room is now part of every variant, and the times are kept only so existing
  // rows survive an edit unchanged (the form no longer exposes them).
  const renderExtraFields = (
    draftValue: ItemDraft,
    setDraftValue: (next: ItemDraft) => void,
    idPrefix: string,
  ) => (
    <>
      <Field label="Ruang (opsional)" htmlFor={`${idPrefix}-room`}>
        <TextInput
          id={`${idPrefix}-room`}
          value={draftValue.room}
          onChange={(e) => setDraftValue({ ...draftValue, room: e.target.value })}
          placeholder="Contoh: Lab Komputer 2"
        />
      </Field>
      {isExam && (
        <Field label="Tanggal ujian (opsional)" htmlFor={`${idPrefix}-date`}>
          <TextInput
            id={`${idPrefix}-date`}
            type="date"
            value={draftValue.examDate}
            onChange={(e) => setDraftValue({ ...draftValue, examDate: e.target.value })}
          />
        </Field>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="text-[10px] font-semibold tracking-[0.2em] text-ink-400 uppercase">
          Kelola Jadwal
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-ink-950">
          {activeTab?.label} <span className="font-normal text-ink-400">· {activeTab?.hint}</span>
        </h1>
        <p className="mt-1 text-[13px] text-ink-500">
          {isExam
            ? "Jadwal ujian terpisah dari Jadwal A dan B. Hanya tampil saat mode ujian aktif."
            : `Jadwal ${version} berdiri sendiri — mengeditnya tidak mengubah versi jadwal lain.`}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-moss-200 bg-moss-50 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-moss-700 uppercase">
              <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-moss-500" />
              Sedang tampil: {liveVersion.label}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-paper-300 px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-ink-500 uppercase">
              Tidak sedang tampil · aktif: {liveVersion.label}
            </span>
          )}
        </div>
      </header>

      {/* Variant switcher */}
      <div role="tablist" aria-label="Pilih versi jadwal" className="grid gap-1.5 sm:grid-cols-3">
        {VERSION_TABS.map((tab) => {
          const isSelected = tab.value === version;
          return (
            <button
              key={tab.value}
              role="tab"
              type="button"
              aria-selected={isSelected}
              onClick={() => switchVersion(tab.value)}
              className={[
                "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                isSelected
                  ? "border-ink-900 bg-ink-900 text-paper-50"
                  : "border-paper-300 bg-white text-ink-700 hover:border-ink-400",
              ].join(" ")}
            >
              <span className="text-[13px] font-semibold">{tab.label}</span>
              <span
                className={[
                  "text-[10px] tracking-wide",
                  isSelected ? "text-paper-200/75" : "text-ink-400",
                ].join(" ")}
              >
                {tab.hint}
              </span>
            </button>
          );
        })}
      </div>

      {/* Day tabs */}
      <div role="tablist" aria-label="Pilih hari untuk dikelola" className="grid grid-cols-5 gap-1.5">
        {SCHOOL_DAYS.map((d) => {
          const count = schedules.find((s) => s.dayOfWeek === d)?.items.length ?? 0;
          const isSelected = d === day;
          return (
            <button
              key={d}
              role="tab"
              type="button"
              aria-selected={isSelected}
              onClick={() => {
                setDay(d);
                setEditingId(null);
                setConfirmId(null);
                setAddErrors({});
                setDraft(emptyDraft);
              }}
              className={[
                "flex flex-col items-center gap-0.5 rounded-lg border px-1.5 py-2.5 text-center transition-colors",
                isSelected
                  ? "border-ink-900 bg-ink-900 text-paper-50"
                  : "border-paper-300 bg-white text-ink-700 hover:border-ink-400",
              ].join(" ")}
            >
              <span className="text-[12px] font-semibold sm:text-[13px]">{SCHOOL_DAY_SHORT[d]}</span>
              <span
                className={[
                  "tabular text-[10px]",
                  isSelected ? "text-paper-200/75" : "text-ink-400",
                ].join(" ")}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <Panel
        title={`Daftar ${isExam ? "sesi ujian" : "pelajaran"} — ${SCHOOL_DAY_NAMES[day]}`}
        description={
          items.length === 0
            ? isExam
              ? "Belum ada sesi ujian untuk hari ini."
              : "Belum ada pelajaran untuk hari ini."
            : `${items.length} ${isExam ? "sesi" : "pelajaran"}, urut dari atas ke bawah.`
        }
        action={
          items.length > 1 ? (
            <span className="text-[10px] text-ink-400">
              {reordering ? "Menyimpan urutan…" : "Gunakan ↑ ↓ untuk mengubah urutan"}
            </span>
          ) : null
        }
      >
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-paper-300 px-4 py-10 text-center">
            <p className="text-[13px] font-medium text-ink-700">Jadwal masih kosong</p>
            <p className="mx-auto mt-1 max-w-xs text-[12px] leading-relaxed text-ink-400">
              Tambahkan {isExam ? "sesi ujian" : "mata pelajaran"} pertama melalui formulir di
              bawah. Halaman publik akan menampilkan empty state sampai ada data.
            </p>
          </div>
        ) : (
          <ol className="divide-y divide-paper-200">
            {items.map((item, index) => {
              const isEditing = editingId === item.id;
              const isConfirming = confirmId === item.id;

              return (
                <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                  {isEditing ? (
                    <div className="rounded-lg border border-ink-400 bg-paper-50 p-3">
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <Field label="Mata pelajaran" htmlFor={`edit-subject-${item.id}`} required>
                          <TextInput
                            id={`edit-subject-${item.id}`}
                            value={editDraft.subject}
                            onChange={(e) => setEditDraft({ ...editDraft, subject: e.target.value })}
                            autoFocus
                          />
                        </Field>
                        <Field
                          label={isExam ? "Pengawas (opsional)" : "Nama guru (opsional)"}
                          htmlFor={`edit-teacher-${item.id}`}
                        >
                          <TextInput
                            id={`edit-teacher-${item.id}`}
                            value={editDraft.teacher}
                            onChange={(e) => setEditDraft({ ...editDraft, teacher: e.target.value })}
                          />
                        </Field>
                        {renderExtraFields(editDraft, setEditDraft, `edit-${item.id}`)}
                      </div>

                      {Object.keys(editErrors).length > 0 && (
                        <ul className="mt-2 flex flex-col gap-0.5">
                          {Object.values(editErrors)
                            .flat()
                            .map((message) => (
                              <li key={message} className="text-[11px] text-clay-600">
                                {message}
                              </li>
                            ))}
                        </ul>
                      )}

                      <div className="mt-2.5 flex gap-2">
                        <PrimaryButton type="button" onClick={() => saveEdit(item.id)} disabled={savingEdit}>
                          {savingEdit ? "Menyimpan…" : "Simpan"}
                        </PrimaryButton>
                        <GhostButton type="button" onClick={() => setEditingId(null)}>
                          Batal
                        </GhostButton>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => move(index, -1)}
                          disabled={index === 0 || reordering}
                          aria-label={`Naikkan ${item.subject}`}
                          className="flex h-8 w-8 items-center justify-center rounded border border-paper-300 text-[9px] leading-none text-ink-500 transition-colors hover:border-ink-500 hover:text-ink-900 disabled:opacity-30"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => move(index, 1)}
                          disabled={index === items.length - 1 || reordering}
                          aria-label={`Turunkan ${item.subject}`}
                          className="flex h-8 w-8 items-center justify-center rounded border border-paper-300 text-[9px] leading-none text-ink-500 transition-colors hover:border-ink-500 hover:text-ink-900 disabled:opacity-30"
                        >
                          ▼
                        </button>
                      </div>

                      <div className="flex w-[8.5rem] shrink-0 flex-col gap-0.5">
                        <span className="tabular text-[10px] font-semibold tracking-[0.14em] text-ink-400 uppercase">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="tabular text-[12px] text-ink-500">
                          {item.startTime && item.endTime ? (
                            <>
                              <span className="font-medium text-ink-900">{item.startTime}</span>
                              <span className="mx-1 text-ink-400">–</span>
                              {item.endTime}
                            </>
                          ) : (
                            <span className="text-ink-400 italic">Tanpa jam</span>
                          )}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink-900">{item.subject}</p>
                        <p className="truncate text-[11px] text-ink-400">
                          {item.teacher || (isExam ? "Pengawas belum diisi" : "Guru belum diisi")}
                          {item.room && ` · ${item.room}`}
                          {isExam && item.examDate && ` · ${item.examDate}`}
                        </p>
                      </div>

                      {isConfirming ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-md border border-clay-200 bg-clay-50 px-2.5 py-1.5">
                          <span className="text-[11px] text-clay-600">
                            {isExam ? "Hapus sesi ini?" : "Hapus pelajaran ini?"}
                          </span>
                          <DangerButton
                            type="button"
                            onClick={() => removeItem(item.id, item.subject)}
                            disabled={deletingId === item.id}
                          >
                            {deletingId === item.id ? "Menghapus…" : "Ya, hapus"}
                          </DangerButton>
                          <GhostButton type="button" onClick={() => setConfirmId(null)}>
                            Batal
                          </GhostButton>
                        </div>
                      ) : (
                        <div className="flex gap-1.5">
                          <GhostButton type="button" onClick={() => startEdit(item)}>
                            Edit
                          </GhostButton>
                          <DangerButton type="button" onClick={() => setConfirmId(item.id)}>
                            Hapus
                          </DangerButton>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Panel>

      <Panel
        title={isExam ? "Tambah sesi ujian" : "Tambah pelajaran"}
        description={`Akan ditambahkan ke hari ${SCHOOL_DAY_NAMES[day]} pada ${activeTab?.label}.`}
      >
        <form onSubmit={addItem} className="flex flex-col gap-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mata pelajaran" htmlFor="new-subject" required>
              <TextInput
                id="new-subject"
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                placeholder={isExam ? "Contoh: Matematika (Ujian)" : "Contoh: Matematika"}
                required
              />
            </Field>
            <Field
              label={isExam ? "Pengawas (opsional)" : "Nama guru (opsional)"}
              htmlFor="new-teacher"
            >
              <TextInput
                id="new-teacher"
                value={draft.teacher}
                onChange={(e) => setDraft({ ...draft, teacher: e.target.value })}
                placeholder="Kosongkan jika belum ada"
              />
            </Field>
            {renderExtraFields(draft, setDraft, "new")}
          </div>

          {Object.keys(addErrors).length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {Object.values(addErrors)
                .flat()
                .map((message) => (
                  <li key={message} className="text-[11px] text-clay-600">
                    {message}
                  </li>
                ))}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <PrimaryButton type="submit" disabled={adding}>
              {adding ? "Menambahkan…" : isExam ? "Tambah sesi" : "Tambah pelajaran"}
            </PrimaryButton>
            <span className="text-[10px] text-ink-400">
              Total {totalItems} {isExam ? "sesi ujian" : `pelajaran di ${activeTab?.label}`}
            </span>
          </div>
        </form>
      </Panel>

      <Panel
        title="Keterangan hari"
        description={
          isExam
            ? "Catatan yang tampil di bawah jadwal ujian hari ini."
            : "Catatan tambahan yang tampil di bawah jadwal hari ini. Tidak menghapus daftar pelajaran."
        }
      >
        <form onSubmit={saveDescription} className="flex flex-col gap-2.5">
          <Field label={`Keterangan hari ${SCHOOL_DAY_NAMES[day]}`} htmlFor="day-description">
            <TextArea
              id="day-description"
              rows={3}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                isExam
                  ? "Contoh: Bawa alat tulis sendiri, tidak boleh membawa HP."
                  : "Contoh: Membawa buku paket dan laptop untuk praktik."
              }
            />
          </Field>
          <div className="flex items-center gap-2">
            <PrimaryButton type="submit" disabled={savingDescription}>
              {savingDescription ? "Menyimpan…" : "Simpan keterangan"}
            </PrimaryButton>
            <span className="text-[10px] text-ink-400">{description.length}/500</span>
          </div>
        </form>
      </Panel>
    </div>
  );
}
