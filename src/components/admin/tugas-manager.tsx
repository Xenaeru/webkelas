"use client";

import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import {
  DangerButton,
  Field,
  GhostButton,
  Panel,
  PrimaryButton,
  Select,
  TextArea,
  TextInput,
} from "@/components/admin/form-controls";
import { apiRequest, RequestError } from "@/lib/api-client";
import { SCHOOL_DAY_NAMES, SCHOOL_DAYS, isSchoolWeekday } from "@/lib/schedule-day";
import { deadlineTone, describeDeadline, formatDueDate, sortAssignments, todayKey } from "@/lib/assignments";
import type { Assignment } from "@/lib/repository";

interface Draft {
  subject: string;
  title: string;
  description: string;
  assignedDay: string;
  dueDate: string;
  notes: string;
  status: "active" | "completed";
}

function emptyDraft(): Draft {
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  return {
    subject: "",
    title: "",
    description: "",
    assignedDay: "",
    dueDate: todayKey(),
    notes: "",
    status: "active",
  };
}

function draftFrom(assignment: Assignment): Draft {
  return {
    subject: assignment.subject,
    title: assignment.title,
    description: assignment.description,
    assignedDay: assignment.assignedDay ? String(assignment.assignedDay) : "",
    dueDate: assignment.dueDate,
    notes: assignment.notes,
    status: assignment.status,
  };
}

function toPayload(draft: Draft) {
  return {
    subject: draft.subject,
    title: draft.title,
    description: draft.description,
    assignedDay: draft.assignedDay === "" ? null : Number(draft.assignedDay),
    dueDate: draft.dueDate,
    notes: draft.notes,
    status: draft.status,
  };
}

export function TugasManager({ initialAssignments }: { initialAssignments: Assignment[] }) {
  const toast = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [creating, setCreating] = useState(false);
  const [createErrors, setCreateErrors] = useState<Record<string, string[]>>({});

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [editErrors, setEditErrors] = useState<Record<string, string[]>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "completed" | "overdue">("all");

  const sorted = useMemo(() => sortAssignments(assignments), [assignments]);

  const visible = useMemo(() => {
    return sorted.filter((assignment) => {
      if (filter === "all") return true;
      if (filter === "overdue") {
        return assignment.status === "active" && describeDeadline(assignment).state === "overdue";
      }
      return assignment.status === filter;
    });
  }, [sorted, filter]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setCreateErrors({});
    setCreating(true);
    try {
      const result = await apiRequest<{ assignment: Assignment }>("/api/assignments", {
        method: "POST",
        body: toPayload(draft),
      });
      setAssignments((prev) => [...prev, result.assignment]);
      setDraft(emptyDraft());
      toast.push(`Tugas "${result.assignment.title}" ditambahkan`);
    } catch (error) {
      if (error instanceof RequestError) {
        setCreateErrors(error.fieldErrors ?? {});
        toast.push(error.message, "error");
      } else {
        toast.push("Gagal menambahkan tugas", "error");
      }
    } finally {
      setCreating(false);
    }
  }

  async function saveEdit(id: number) {
    setEditErrors({});
    setSavingEdit(true);
    try {
      const result = await apiRequest<{ assignment: Assignment }>(`/api/assignments/${id}`, {
        method: "PUT",
        body: toPayload(editDraft),
      });
      setAssignments((prev) => prev.map((a) => (a.id === id ? result.assignment : a)));
      setEditingId(null);
      toast.push("Tugas diperbarui");
    } catch (error) {
      if (error instanceof RequestError) {
        setEditErrors(error.fieldErrors ?? {});
        toast.push(error.message, "error");
      } else {
        toast.push("Gagal memperbarui tugas", "error");
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function remove(id: number, title: string) {
    setDeletingId(id);
    try {
      await apiRequest(`/api/assignments/${id}`, { method: "DELETE" });
      setAssignments((prev) => prev.filter((a) => a.id !== id));
      setConfirmId(null);
      toast.push(`Tugas "${title}" dihapus`);
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Gagal menghapus tugas", "error");
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleStatus(assignment: Assignment) {
    const nextStatus = assignment.status === "active" ? "completed" : "active";
    try {
      const result = await apiRequest<{ assignment: Assignment }>(
        `/api/assignments/${assignment.id}`,
        { method: "PUT", body: { ...toPayload(draftFrom(assignment)), status: nextStatus } },
      );
      setAssignments((prev) => prev.map((a) => (a.id === assignment.id ? result.assignment : a)));
      toast.push(nextStatus === "completed" ? "Tugas ditandai selesai" : "Tugas diaktifkan kembali");
    } catch (error) {
      toast.push(error instanceof Error ? error.message : "Gagal mengubah status", "error");
    }
  }

  function renderFields(
    value: Draft,
    onChange: (next: Draft) => void,
    errors: Record<string, string[]>,
    prefix: string,
  ) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Mata pelajaran" htmlFor={`${prefix}-subject`} required>
          <TextInput
            id={`${prefix}-subject`}
            value={value.subject}
            onChange={(e) => onChange({ ...value, subject: e.target.value })}
            placeholder="Contoh: Matematika"
          />
        </Field>
        <Field label="Judul tugas" htmlFor={`${prefix}-title`} required>
          <TextInput
            id={`${prefix}-title`}
            value={value.title}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
            placeholder="Contoh: Latihan soal bab 2"
          />
        </Field>

        <Field label="Diberikan hari" htmlFor={`${prefix}-day`} hint="Opsional, untuk pengelompokan per hari.">
          <Select
            id={`${prefix}-day`}
            value={value.assignedDay}
            onChange={(e) => onChange({ ...value, assignedDay: e.target.value })}
          >
            <option value="">Tanpa hari</option>
            {SCHOOL_DAYS.map((day) => (
              <option key={day} value={day}>
                {SCHOOL_DAY_NAMES[day]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Deadline" htmlFor={`${prefix}-due`} required>
          <TextInput
            id={`${prefix}-due`}
            type="date"
            value={value.dueDate}
            onChange={(e) => onChange({ ...value, dueDate: e.target.value })}
          />
        </Field>

        <Field label="Status" htmlFor={`${prefix}-status`}>
          <Select
            id={`${prefix}-status`}
            value={value.status}
            onChange={(e) =>
              onChange({ ...value, status: e.target.value === "completed" ? "completed" : "active" })
            }
          >
            <option value="active">Aktif</option>
            <option value="completed">Selesai</option>
          </Select>
        </Field>

        <Field label="Keterangan tambahan" htmlFor={`${prefix}-notes`} hint="Tampil sebagai catatan kecil di kartu tugas.">
          <TextInput
            id={`${prefix}-notes`}
            value={value.notes}
            onChange={(e) => onChange({ ...value, notes: e.target.value })}
            placeholder="Contoh: Dikumpulkan dalam bentuk PDF"
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Deskripsi tugas" htmlFor={`${prefix}-description`}>
            <TextArea
              id={`${prefix}-description`}
              rows={4}
              maxLength={4000}
              value={value.description}
              onChange={(e) => onChange({ ...value, description: e.target.value })}
              placeholder="Jelaskan detail tugas, halaman, atau format pengumpulan."
            />
          </Field>
        </div>

        {Object.keys(errors).length > 0 && (
          <ul className="sm:col-span-2 flex flex-col gap-0.5">
            {Object.values(errors)
              .flat()
              .map((message) => (
                <li key={message} className="text-[11px] text-clay-600">
                  {message}
                </li>
              ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="text-[10px] font-semibold tracking-[0.2em] text-ink-400 uppercase">Kelola Tugas</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink-950">Daftar tugas</h1>
        <p className="mt-1 text-[13px] text-ink-500">
          Tugas tidak terhapus otomatis saat deadline lewat. Tandai selesai secara manual.
        </p>
      </header>

      <Panel
        title="Daftar tugas"
        description={`${assignments.length} tugas tersimpan`}
        action={
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["all", "Semua"],
                ["active", "Aktif"],
                ["overdue", "Terlambat"],
                ["completed", "Selesai"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={[
                  "rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                  filter === key
                    ? "bg-ink-900 text-paper-50"
                    : "border border-paper-300 text-ink-500 hover:border-ink-500",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        {visible.length === 0 ? (
          <div className="rounded-lg border border-dashed border-paper-300 px-4 py-10 text-center">
            <p className="text-[13px] font-medium text-ink-700">
              {assignments.length === 0 ? "Belum ada tugas" : "Tidak ada tugas pada filter ini"}
            </p>
            <p className="mx-auto mt-1 max-w-xs text-[12px] leading-relaxed text-ink-400">
              {assignments.length === 0
                ? "Tambahkan tugas pertama melalui formulir di bawah."
                : "Coba pilih filter lain."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-paper-200">
            {visible.map((assignment) => {
              const isEditing = editingId === assignment.id;
              const isConfirming = confirmId === assignment.id;
              const deadline = describeDeadline(assignment);

              if (isEditing) {
                return (
                  <li key={assignment.id} className="py-3 first:pt-0">
                    <div className="rounded-lg border border-ink-400 bg-paper-50 p-3">
                      {renderFields(editDraft, setEditDraft, editErrors, `edit-${assignment.id}`)}
                      <div className="mt-3 flex gap-2">
                        <PrimaryButton
                          type="button"
                          onClick={() => saveEdit(assignment.id)}
                          disabled={savingEdit}
                        >
                          {savingEdit ? "Menyimpan…" : "Simpan perubahan"}
                        </PrimaryButton>
                        <GhostButton type="button" onClick={() => setEditingId(null)}>
                          Batal
                        </GhostButton>
                      </div>
                    </div>
                  </li>
                );
              }

              return (
                <li key={assignment.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-semibold tracking-[0.1em] text-moss-600 uppercase">
                          {assignment.subject}
                        </span>
                        <Badge tone={deadlineTone(deadline.state)}>{deadline.label}</Badge>
                        {assignment.assignedDay && isSchoolWeekday(assignment.assignedDay) && (
                          <span className="text-[10px] text-ink-400">
                            {SCHOOL_DAY_NAMES[assignment.assignedDay]}
                          </span>
                        )}
                      </div>
                      <p
                        className={[
                          "mt-1 text-[13px] font-medium text-ink-900",
                          assignment.status === "completed" ? "line-through decoration-ink-400" : "",
                        ].join(" ")}
                      >
                        {assignment.title}
                      </p>
                      {assignment.description && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-ink-500">
                          {assignment.description}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] text-ink-400">
                        Deadline {formatDueDate(assignment.dueDate)}
                      </p>
                    </div>

                    {isConfirming ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-md border border-clay-200 bg-clay-50 px-2.5 py-1.5">
                        <span className="text-[11px] text-clay-600">Hapus tugas ini?</span>
                        <DangerButton
                          type="button"
                          onClick={() => remove(assignment.id, assignment.title)}
                          disabled={deletingId === assignment.id}
                        >
                          {deletingId === assignment.id ? "Menghapus…" : "Ya, hapus"}
                        </DangerButton>
                        <GhostButton type="button" onClick={() => setConfirmId(null)}>
                          Batal
                        </GhostButton>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        <GhostButton type="button" onClick={() => toggleStatus(assignment)}>
                          {assignment.status === "active" ? "Tandai selesai" : "Aktifkan"}
                        </GhostButton>
                        <GhostButton
                          type="button"
                          onClick={() => {
                            setEditingId(assignment.id);
                            setEditDraft(draftFrom(assignment));
                            setEditErrors({});
                            setConfirmId(null);
                          }}
                        >
                          Edit
                        </GhostButton>
                        <DangerButton type="button" onClick={() => setConfirmId(assignment.id)}>
                          Hapus
                        </DangerButton>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Tambah tugas" description="Isi detail tugas yang akan tampil di halaman publik.">
        <form onSubmit={create} className="flex flex-col gap-3" noValidate>
          {renderFields(draft, setDraft, createErrors, "new")}
          <div>
            <PrimaryButton type="submit" disabled={creating}>
              {creating ? "Menambahkan…" : "Tambah tugas"}
            </PrimaryButton>
          </div>
        </form>
      </Panel>
    </div>
  );
}
